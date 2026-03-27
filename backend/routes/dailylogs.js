const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET daily logs with filters
router.get('/', async (req, res) => {
  try {
    const { projectId, startDate, endDate } = req.query;
    let query = `
      SELECT dl.*, p.name as project_name
      FROM dailylogs dl
      LEFT JOIN projects p ON p.id = dl.project_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (projectId) { query += ` AND dl.project_id = $${idx++}`; params.push(projectId); }
    if (startDate) { query += ` AND dl.log_date >= $${idx++}`; params.push(startDate); }
    if (endDate) { query += ` AND dl.log_date <= $${idx++}`; params.push(endDate); }
    query += ' ORDER BY dl.log_date DESC';

    const logs = await pool.query(query, params);

    const result = await Promise.all(logs.rows.map(async (log) => {
      const [laborResult, equipmentResult] = await Promise.all([
        pool.query('SELECT * FROM labor WHERE dailylog_id = $1', [log.id]),
        pool.query('SELECT * FROM equipment WHERE dailylog_id = $1', [log.id]),
      ]);
      return { ...log, labor: laborResult.rows, equipment: equipmentResult.rows };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single daily log
router.get('/:id', async (req, res) => {
  try {
    const logResult = await pool.query(
      `SELECT dl.*, p.name as project_name FROM dailylogs dl
       LEFT JOIN projects p ON p.id = dl.project_id
       WHERE dl.id = $1`,
      [req.params.id]
    );
    if (logResult.rows.length === 0) return res.status(404).json({ error: '일지를 찾을 수 없습니다' });

    const log = logResult.rows[0];
    const [laborResult, equipmentResult] = await Promise.all([
      pool.query('SELECT * FROM labor WHERE dailylog_id = $1', [log.id]),
      pool.query('SELECT * FROM equipment WHERE dailylog_id = $1', [log.id]),
    ]);
    res.json({ ...log, labor: laborResult.rows, equipment: equipmentResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create daily log
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, log_date, weather, work_description, notes, labor: laborItems, equipment: equipmentItems } = req.body;
    if (!project_id || !log_date) return res.status(400).json({ error: '프로젝트와 날짜는 필수입니다' });

    let totalLaborCost = 0;
    let totalEquipmentCost = 0;
    if (laborItems) laborItems.forEach(l => { totalLaborCost += (l.count * l.unit_price) || 0; });
    if (equipmentItems) equipmentItems.forEach(e => { totalEquipmentCost += (e.count * e.unit_price) || 0; });

    await client.query('BEGIN');

    const logResult = await client.query(
      `INSERT INTO dailylogs (project_id, log_date, weather, work_description, total_labor_cost, total_equipment_cost, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [project_id, log_date, weather || '맑음', work_description, totalLaborCost, totalEquipmentCost, notes]
    );
    const logId = logResult.rows[0].id;

    if (laborItems && laborItems.length > 0) {
      for (const l of laborItems) {
        const total = (l.count || 1) * (l.unit_price || 0);
        await client.query(
          'INSERT INTO labor (dailylog_id, worker_type, count, unit_price, total_price, notes) VALUES ($1, $2, $3, $4, $5, $6)',
          [logId, l.worker_type, l.count || 1, l.unit_price || 0, total, l.notes]
        );
      }
    }

    if (equipmentItems && equipmentItems.length > 0) {
      for (const e of equipmentItems) {
        const total = (e.count || 1) * (e.unit_price || 0);
        await client.query(
          'INSERT INTO equipment (dailylog_id, equipment_type, count, unit_price, total_price, notes) VALUES ($1, $2, $3, $4, $5, $6)',
          [logId, e.equipment_type, e.count || 1, e.unit_price || 0, total, e.notes]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ id: logId, message: '일지가 생성되었습니다' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update daily log
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, log_date, weather, work_description, notes, labor: laborItems, equipment: equipmentItems } = req.body;

    let totalLaborCost = 0;
    let totalEquipmentCost = 0;
    if (laborItems) laborItems.forEach(l => { totalLaborCost += (l.count * l.unit_price) || 0; });
    if (equipmentItems) equipmentItems.forEach(e => { totalEquipmentCost += (e.count * e.unit_price) || 0; });

    await client.query('BEGIN');

    await client.query(
      `UPDATE dailylogs SET project_id = $1, log_date = $2, weather = $3, work_description = $4,
       total_labor_cost = $5, total_equipment_cost = $6, notes = $7, updated_at = NOW()
       WHERE id = $8`,
      [project_id, log_date, weather, work_description, totalLaborCost, totalEquipmentCost, notes, req.params.id]
    );

    await client.query('DELETE FROM labor WHERE dailylog_id = $1', [req.params.id]);
    await client.query('DELETE FROM equipment WHERE dailylog_id = $1', [req.params.id]);

    if (laborItems && laborItems.length > 0) {
      for (const l of laborItems) {
        const total = (l.count || 1) * (l.unit_price || 0);
        await client.query(
          'INSERT INTO labor (dailylog_id, worker_type, count, unit_price, total_price, notes) VALUES ($1, $2, $3, $4, $5, $6)',
          [req.params.id, l.worker_type, l.count || 1, l.unit_price || 0, total, l.notes]
        );
      }
    }

    if (equipmentItems && equipmentItems.length > 0) {
      for (const e of equipmentItems) {
        const total = (e.count || 1) * (e.unit_price || 0);
        await client.query(
          'INSERT INTO equipment (dailylog_id, equipment_type, count, unit_price, total_price, notes) VALUES ($1, $2, $3, $4, $5, $6)',
          [req.params.id, e.equipment_type, e.count || 1, e.unit_price || 0, total, e.notes]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: '일지가 수정되었습니다' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE daily log
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dailylogs WHERE id = $1', [req.params.id]);
    res.json({ message: '일지가 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST parse KakaoTalk text via Claude API
router.post('/parse', async (req, res) => {
  try {
    const { text, projectId } = req.body;
    if (!text) return res.status(400).json({ error: '파싱할 텍스트가 없습니다' });

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const unitPricesResult = await pool.query('SELECT * FROM unitprices');
    const unitPriceMap = unitPricesResult.rows.reduce((acc, up) => {
      acc[up.item_name] = up.unit_price;
      return acc;
    }, {});

    const systemPrompt = `당신은 조경회사 현장 카카오톡 메시지를 파싱하는 전문가입니다.
주어진 카카오톡 대화 내용에서 현장 일지 정보를 추출하여 JSON 형식으로 반환하세요.

추출할 정보:
- 날짜 (YYYY-MM-DD 형식)
- 날씨 (맑음/흐림/비/눈 중 하나)
- 작업 내용 설명
- 투입 인력 목록 (직종, 인원수)
- 투입 장비 목록 (장비종류, 대수)

단가표:
${JSON.stringify(unitPriceMap, null, 2)}

응답 형식 (JSON만 반환):
{
  "log_date": "YYYY-MM-DD",
  "weather": "맑음",
  "work_description": "작업 내용",
  "labor": [
    {"worker_type": "조경공", "count": 3, "unit_price": 200000}
  ],
  "equipment": [
    {"equipment_type": "굴삭기03", "count": 1, "unit_price": 400000}
  ]
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: `다음 카카오톡 메시지를 파싱해주세요:\n\n${text}` }],
    });

    let parsed;
    try {
      const content = message.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch (parseErr) {
      return res.status(400).json({ error: 'AI 응답을 파싱할 수 없습니다', raw: message.content[0].text });
    }

    if (parsed.labor) {
      parsed.labor = parsed.labor.map(l => ({
        ...l,
        unit_price: l.unit_price || unitPriceMap[l.worker_type] || 0,
        total_price: (l.count || 1) * (l.unit_price || unitPriceMap[l.worker_type] || 0),
      }));
    }
    if (parsed.equipment) {
      parsed.equipment = parsed.equipment.map(e => ({
        ...e,
        unit_price: e.unit_price || unitPriceMap[e.equipment_type] || 0,
        total_price: (e.count || 1) * (e.unit_price || unitPriceMap[e.equipment_type] || 0),
      }));
    }

    if (projectId) parsed.project_id = projectId;
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
