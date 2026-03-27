const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../database');

// POST /api/share/kakao - 카카오톡 공유 수신 후 AI 파싱 및 저장
router.post('/kakao', async (req, res) => {
  const client = await pool.connect();
  try {
    const { text, project_id } = req.body;
    if (!text) return res.status(400).json({ error: '텍스트가 필요합니다.' });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const unitPricesResult = await pool.query('SELECT * FROM unitprices');
    const unitPriceMap = unitPricesResult.rows.reduce((acc, up) => {
      acc[up.item_name] = up.unit_price;
      return acc;
    }, {});

    const systemPrompt = `당신은 조경회사 현장 카카오톡 메시지를 파싱하는 전문가입니다.
주어진 카카오톡 대화 내용에서 현장 일지 정보를 추출하여 JSON 형식으로 반환하세요.

추출할 정보:
- 날짜 (YYYY-MM-DD 형식, 없으면 오늘 날짜)
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

    const message = await anthropic.messages.create({
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
    } catch {
      return res.status(400).json({ error: 'AI 응답 파싱 실패', raw: message.content[0].text });
    }

    const today = new Date().toISOString().slice(0, 10);
    parsed.log_date = parsed.log_date || today;

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

    const totalLaborCost = (parsed.labor || []).reduce((s, l) => s + (l.total_price || 0), 0);
    const totalEquipmentCost = (parsed.equipment || []).reduce((s, e) => s + (e.total_price || 0), 0);
    const pid = project_id || null;

    await client.query('BEGIN');

    const logResult = await client.query(
      `INSERT INTO dailylogs (project_id, log_date, weather, work_description, total_labor_cost, total_equipment_cost, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [pid, parsed.log_date, parsed.weather || '맑음', parsed.work_description || '', totalLaborCost, totalEquipmentCost, '카카오톡 공유 수신']
    );
    const logId = logResult.rows[0].id;

    if (parsed.labor && parsed.labor.length > 0) {
      for (const l of parsed.labor) {
        await client.query(
          'INSERT INTO labor (dailylog_id, worker_type, count, unit_price, total_price, notes) VALUES ($1, $2, $3, $4, $5, $6)',
          [logId, l.worker_type, l.count || 1, l.unit_price || 0, l.total_price || 0, null]
        );
      }
    }

    if (parsed.equipment && parsed.equipment.length > 0) {
      for (const e of parsed.equipment) {
        await client.query(
          'INSERT INTO equipment (dailylog_id, equipment_type, count, unit_price, total_price, notes) VALUES ($1, $2, $3, $4, $5, $6)',
          [logId, e.equipment_type, e.count || 1, e.unit_price || 0, e.total_price || 0, null]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, id: logId, ...parsed, total_labor_cost: totalLaborCost, total_equipment_cost: totalEquipmentCost });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
