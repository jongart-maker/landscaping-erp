const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET all projects
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT
        p.*,
        COALESCE(SUM(dl.total_labor_cost + dl.total_equipment_cost), 0) +
        COALESCE((SELECT SUM(total_amount) FROM purchases WHERE project_id = p.id), 0) as total_cost,
        COALESCE((SELECT SUM(amount) FROM payments WHERE project_id = p.id AND is_received = 1), 0) as total_received
      FROM projects p
      LEFT JOIN dailylogs dl ON dl.project_id = p.id
    `;
    const params = [];
    if (status) {
      query += ' WHERE p.status = $1';
      params.push(status);
    }
    query += ' GROUP BY p.id ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single project
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create project
router.post('/', async (req, res) => {
  try {
    const { name, client, location, start_date, end_date, contract_amount, status, description } = req.body;
    if (!name || !client) return res.status(400).json({ error: '프로젝트명과 발주처는 필수입니다' });

    const result = await pool.query(
      `INSERT INTO projects (name, client, location, start_date, end_date, contract_amount, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [name, client, location, start_date, end_date, contract_amount || 0, status || '진행중', description]
    );
    res.json({ id: result.rows[0].id, message: '프로젝트가 생성되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update project
router.put('/:id', async (req, res) => {
  try {
    const { name, client, location, start_date, end_date, contract_amount, status, description } = req.body;
    await pool.query(
      `UPDATE projects SET name = $1, client = $2, location = $3, start_date = $4, end_date = $5,
       contract_amount = $6, status = $7, description = $8, updated_at = NOW()
       WHERE id = $9`,
      [name, client, location, start_date, end_date, contract_amount, status, description, req.params.id]
    );
    res.json({ message: '프로젝트가 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE project
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ message: '프로젝트가 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET contracts for project
router.get('/:id/contracts', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM contracts WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add contract to project
router.post('/:id/contracts', async (req, res) => {
  try {
    const { contract_type, contract_date, amount, labor_budget, equipment_budget, material_budget, overhead_budget, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO contracts (project_id, contract_type, contract_date, amount, labor_budget, equipment_budget, material_budget, overhead_budget, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [req.params.id, contract_type || '본계약', contract_date, amount || 0, labor_budget || 0, equipment_budget || 0, material_budget || 0, overhead_budget || 0, notes]
    );

    if (amount) {
      const totalResult = await pool.query('SELECT SUM(amount) as total FROM contracts WHERE project_id = $1', [req.params.id]);
      await pool.query(
        'UPDATE projects SET contract_amount = $1, updated_at = NOW() WHERE id = $2',
        [totalResult.rows[0].total || 0, req.params.id]
      );
    }

    res.json({ id: result.rows[0].id, message: '계약이 추가되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE contract
router.delete('/:projectId/contracts/:contractId', async (req, res) => {
  try {
    await pool.query('DELETE FROM contracts WHERE id = $1 AND project_id = $2', [req.params.contractId, req.params.projectId]);
    res.json({ message: '계약이 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
