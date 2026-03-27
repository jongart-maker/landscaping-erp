const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET progress bills
router.get('/progressbills', async (req, res) => {
  try {
    const { projectId } = req.query;
    let query = `
      SELECT pb.*, p.name as project_name,
        COALESCE((SELECT SUM(amount) FROM payments WHERE progressbill_id = pb.id AND is_received = 1), 0) as received_amount
      FROM progressbills pb
      LEFT JOIN projects p ON p.id = pb.project_id
      WHERE 1=1
    `;
    const params = [];
    if (projectId) { query += ' AND pb.project_id = $1'; params.push(projectId); }
    query += ' ORDER BY pb.bill_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create progress bill
router.post('/progressbills', async (req, res) => {
  try {
    const { project_id, bill_date, bill_number, progress_rate, bill_amount, supply_amount, tax_amount, notes } = req.body;
    if (!project_id || !bill_date) return res.status(400).json({ error: '프로젝트와 청구일은 필수입니다' });

    const supplyAmt = supply_amount || Math.round((bill_amount || 0) / 1.1);
    const taxAmt = tax_amount || (bill_amount || 0) - supplyAmt;

    const result = await pool.query(
      `INSERT INTO progressbills (project_id, bill_date, bill_number, progress_rate, bill_amount, supply_amount, tax_amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [project_id, bill_date, bill_number, progress_rate || 0, bill_amount || 0, supplyAmt, taxAmt, notes]
    );
    res.json({ id: result.rows[0].id, message: '기성청구서가 등록되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update progress bill
router.put('/progressbills/:id', async (req, res) => {
  try {
    const { project_id, bill_date, bill_number, progress_rate, bill_amount, supply_amount, tax_amount, notes } = req.body;
    await pool.query(
      `UPDATE progressbills SET project_id = $1, bill_date = $2, bill_number = $3, progress_rate = $4,
       bill_amount = $5, supply_amount = $6, tax_amount = $7, notes = $8
       WHERE id = $9`,
      [project_id, bill_date, bill_number, progress_rate, bill_amount, supply_amount, tax_amount, notes, req.params.id]
    );
    res.json({ message: '기성청구서가 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE progress bill
router.delete('/progressbills/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM progressbills WHERE id = $1', [req.params.id]);
    res.json({ message: '기성청구서가 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET payments
router.get('/payments', async (req, res) => {
  try {
    const { projectId } = req.query;
    let query = `
      SELECT py.*, p.name as project_name, pb.bill_number, pb.bill_date
      FROM payments py
      LEFT JOIN projects p ON p.id = py.project_id
      LEFT JOIN progressbills pb ON pb.id = py.progressbill_id
      WHERE 1=1
    `;
    const params = [];
    if (projectId) { query += ' AND py.project_id = $1'; params.push(projectId); }
    query += ' ORDER BY py.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create payment
router.post('/payments', async (req, res) => {
  try {
    const { project_id, progressbill_id, payment_date, amount, payment_method, is_received, due_date, notes } = req.body;
    if (!project_id) return res.status(400).json({ error: '프로젝트는 필수입니다' });

    const result = await pool.query(
      `INSERT INTO payments (project_id, progressbill_id, payment_date, amount, payment_method, is_received, due_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [project_id, progressbill_id, payment_date, amount || 0, payment_method || '계좌이체', is_received ? 1 : 0, due_date, notes]
    );
    res.json({ id: result.rows[0].id, message: '수금이 등록되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update payment
router.put('/payments/:id', async (req, res) => {
  try {
    const { project_id, progressbill_id, payment_date, amount, payment_method, is_received, due_date, notes } = req.body;
    await pool.query(
      `UPDATE payments SET project_id = $1, progressbill_id = $2, payment_date = $3, amount = $4,
       payment_method = $5, is_received = $6, due_date = $7, notes = $8
       WHERE id = $9`,
      [project_id, progressbill_id, payment_date, amount, payment_method, is_received ? 1 : 0, due_date, notes, req.params.id]
    );
    res.json({ message: '수금이 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE payment
router.delete('/payments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
    res.json({ message: '수금이 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET receivables with aging analysis
router.get('/payments/receivables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM (
        SELECT
          p.id as project_id,
          p.name as project_name,
          p.client,
          pb.id as bill_id,
          pb.bill_date,
          pb.bill_number,
          pb.bill_amount,
          COALESCE(
            (SELECT SUM(amount) FROM payments WHERE progressbill_id = pb.id AND is_received = 1), 0
          ) as received_amount,
          pb.bill_amount - COALESCE(
            (SELECT SUM(amount) FROM payments WHERE progressbill_id = pb.id AND is_received = 1), 0
          ) as outstanding,
          (CURRENT_DATE - pb.bill_date::date) as days_outstanding
        FROM progressbills pb
        JOIN projects p ON p.id = pb.project_id
      ) sub
      WHERE outstanding > 0
      ORDER BY days_outstanding DESC
    `);

    const receivables = result.rows;
    const aging = {
      within30: receivables.filter(r => r.days_outstanding <= 30),
      days31to60: receivables.filter(r => r.days_outstanding > 30 && r.days_outstanding <= 60),
      days61to90: receivables.filter(r => r.days_outstanding > 60 && r.days_outstanding <= 90),
      over90: receivables.filter(r => r.days_outstanding > 90),
      total: receivables.reduce((sum, r) => sum + parseInt(r.outstanding), 0),
      items: receivables,
    };
    res.json(aging);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
