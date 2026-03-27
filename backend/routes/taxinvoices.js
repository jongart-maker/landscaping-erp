const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET tax invoices with filters
router.get('/', async (req, res) => {
  try {
    const { type, status, month } = req.query;
    let query = `
      SELECT ti.*, p.name as project_name, v.name as vendor_name
      FROM taxinvoices ti
      LEFT JOIN projects p ON p.id = ti.project_id
      LEFT JOIN vendors v ON v.id = ti.vendor_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (type) { query += ` AND ti.invoice_type = $${idx++}`; params.push(type); }
    if (status) { query += ` AND ti.status = $${idx++}`; params.push(status); }
    if (month) { query += ` AND TO_CHAR(ti.issue_date::date, 'YYYY-MM') = $${idx++}`; params.push(month); }
    query += ' ORDER BY ti.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET monthly summary
router.get('/summary', async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const result = await pool.query(
      `SELECT
        TO_CHAR(issue_date::date, 'YYYY-MM') as month,
        invoice_type,
        COUNT(*) as count,
        SUM(supply_amount) as total_supply,
        SUM(tax_amount) as total_tax,
        SUM(total_amount) as total_amount
       FROM taxinvoices
       WHERE TO_CHAR(issue_date::date, 'YYYY') = $1
       GROUP BY month, invoice_type
       ORDER BY month`,
      [String(currentYear)]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single invoice
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ti.*, p.name as project_name, v.name as vendor_name
       FROM taxinvoices ti
       LEFT JOIN projects p ON p.id = ti.project_id
       LEFT JOIN vendors v ON v.id = ti.vendor_id
       WHERE ti.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '세금계산서를 찾을 수 없습니다' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create tax invoice
router.post('/', async (req, res) => {
  try {
    const { invoice_type, project_id, vendor_id, issue_date, supply_amount, tax_amount, total_amount, status, invoice_number, notes } = req.body;
    if (!invoice_type) return res.status(400).json({ error: '계산서 유형은 필수입니다' });

    const supplyAmt = supply_amount || 0;
    const taxAmt = tax_amount || Math.round(supplyAmt * 0.1);
    const totalAmt = total_amount || (supplyAmt + taxAmt);

    const result = await pool.query(
      `INSERT INTO taxinvoices (invoice_type, project_id, vendor_id, issue_date, supply_amount, tax_amount, total_amount, status, invoice_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [invoice_type, project_id, vendor_id, issue_date, supplyAmt, taxAmt, totalAmt, status || '미발행', invoice_number, notes]
    );
    res.json({ id: result.rows[0].id, message: '세금계산서가 등록되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update tax invoice
router.put('/:id', async (req, res) => {
  try {
    const { invoice_type, project_id, vendor_id, issue_date, supply_amount, tax_amount, total_amount, status, invoice_number, notes } = req.body;
    await pool.query(
      `UPDATE taxinvoices SET invoice_type = $1, project_id = $2, vendor_id = $3, issue_date = $4,
       supply_amount = $5, tax_amount = $6, total_amount = $7, status = $8, invoice_number = $9, notes = $10
       WHERE id = $11`,
      [invoice_type, project_id, vendor_id, issue_date, supply_amount, tax_amount, total_amount, status, invoice_number, notes, req.params.id]
    );
    res.json({ message: '세금계산서가 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE tax invoice
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM taxinvoices WHERE id = $1', [req.params.id]);
    res.json({ message: '세금계산서가 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
