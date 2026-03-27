const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET defect statistics - must be before /:id route
router.get('/stats', async (req, res) => {
  try {
    const { projectId } = req.query;
    let whereClause = '';
    const params = [];
    if (projectId) { whereClause = 'WHERE d.project_id = $1'; params.push(projectId); }

    const [byTypeResult, byStatusResult, byProjectResult, overdueResult] = await Promise.all([
      pool.query(
        `SELECT defect_type, COUNT(*) as count,
          COUNT(CASE WHEN status = '완료' THEN 1 END) as resolved,
          COUNT(CASE WHEN status != '완료' THEN 1 END) as pending
         FROM defects d
         ${whereClause}
         GROUP BY defect_type`,
        params
      ),
      pool.query(
        `SELECT status, COUNT(*) as count FROM defects d ${whereClause} GROUP BY status`,
        params
      ),
      pool.query(
        `SELECT p.id, p.name as project_name,
          COUNT(d.id) as total_defects,
          COUNT(CASE WHEN d.status = '완료' THEN 1 END) as resolved,
          COUNT(CASE WHEN d.status != '완료' THEN 1 END) as pending,
          COALESCE(SUM(dc.amount), 0) as total_cost
         FROM projects p
         LEFT JOIN defects d ON d.project_id = p.id
         LEFT JOIN defectcosts dc ON dc.defect_id = d.id
         GROUP BY p.id
         ORDER BY total_defects DESC
         LIMIT 10`
      ),
      pool.query(
        `SELECT d.*, p.name as project_name,
          (CURRENT_DATE - d.due_date::date) as days_overdue
         FROM defects d
         JOIN projects p ON p.id = d.project_id
         WHERE d.status NOT IN ('완료') AND d.due_date < CURRENT_DATE::text
         ORDER BY days_overdue DESC`
      ),
    ]);

    res.json({
      byType: byTypeResult.rows,
      byStatus: byStatusResult.rows,
      byProject: byProjectResult.rows,
      overdueDefects: overdueResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET defects with filters
router.get('/', async (req, res) => {
  try {
    const { projectId, status, defect_type } = req.query;
    let query = `
      SELECT d.*, p.name as project_name,
        COALESCE((SELECT SUM(amount) FROM defectcosts WHERE defect_id = d.id), 0) as total_cost
      FROM defects d
      LEFT JOIN projects p ON p.id = d.project_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (projectId) { query += ` AND d.project_id = $${idx++}`; params.push(projectId); }
    if (status) { query += ` AND d.status = $${idx++}`; params.push(status); }
    if (defect_type) { query += ` AND d.defect_type = $${idx++}`; params.push(defect_type); }
    query += ' ORDER BY d.reported_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single defect
router.get('/:id', async (req, res) => {
  try {
    const defectResult = await pool.query(
      `SELECT d.*, p.name as project_name FROM defects d
       LEFT JOIN projects p ON p.id = d.project_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (defectResult.rows.length === 0) return res.status(404).json({ error: '하자를 찾을 수 없습니다' });

    const costsResult = await pool.query('SELECT * FROM defectcosts WHERE defect_id = $1', [req.params.id]);
    res.json({ ...defectResult.rows[0], costs: costsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create defect
router.post('/', async (req, res) => {
  try {
    const { project_id, defect_type, title, description, location, reported_date, due_date, status, priority, assigned_to, reporter, notes } = req.body;
    if (!project_id || !title || !reported_date) return res.status(400).json({ error: '프로젝트, 제목, 접수일은 필수입니다' });

    const result = await pool.query(
      `INSERT INTO defects (project_id, defect_type, title, description, location, reported_date, due_date, status, priority, assigned_to, reporter, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [project_id, defect_type || '식재', title, description, location, reported_date, due_date, status || '접수', priority || '보통', assigned_to, reporter, notes]
    );
    res.json({ id: result.rows[0].id, message: '하자가 접수되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update defect
router.put('/:id', async (req, res) => {
  try {
    const { project_id, defect_type, title, description, location, reported_date, due_date, status, priority, assigned_to, resolution, resolved_date, reporter, notes } = req.body;
    await pool.query(
      `UPDATE defects SET project_id = $1, defect_type = $2, title = $3, description = $4, location = $5,
       reported_date = $6, due_date = $7, status = $8, priority = $9, assigned_to = $10, resolution = $11,
       resolved_date = $12, reporter = $13, notes = $14, updated_at = NOW()
       WHERE id = $15`,
      [project_id, defect_type, title, description, location, reported_date, due_date, status, priority, assigned_to, resolution, resolved_date, reporter, notes, req.params.id]
    );
    res.json({ message: '하자가 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE defect
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM defects WHERE id = $1', [req.params.id]);
    res.json({ message: '하자가 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add defect cost
router.post('/:id/costs', async (req, res) => {
  try {
    const { cost_date, cost_type, amount, description, vendor_id } = req.body;
    const result = await pool.query(
      `INSERT INTO defectcosts (defect_id, cost_date, cost_type, amount, description, vendor_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.params.id, cost_date, cost_type || '자재', amount || 0, description, vendor_id]
    );
    res.json({ id: result.rows[0].id, message: '비용이 등록되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE defect cost
router.delete('/:id/costs/:costId', async (req, res) => {
  try {
    await pool.query('DELETE FROM defectcosts WHERE id = $1 AND defect_id = $2', [req.params.costId, req.params.id]);
    res.json({ message: '비용이 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
