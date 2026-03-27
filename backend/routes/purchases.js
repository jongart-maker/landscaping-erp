const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET purchases with filters
router.get('/', async (req, res) => {
  try {
    const { projectId, vendorId, month } = req.query;
    let query = `
      SELECT pu.*, p.name as project_name, v.name as vendor_name
      FROM purchases pu
      LEFT JOIN projects p ON p.id = pu.project_id
      LEFT JOIN vendors v ON v.id = pu.vendor_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (projectId) { query += ` AND pu.project_id = $${idx++}`; params.push(projectId); }
    if (vendorId) { query += ` AND pu.vendor_id = $${idx++}`; params.push(vendorId); }
    if (month) { query += ` AND TO_CHAR(pu.purchase_date::date, 'YYYY-MM') = $${idx++}`; params.push(month); }
    query += ' ORDER BY pu.purchase_date DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single purchase
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pu.*, p.name as project_name, v.name as vendor_name
       FROM purchases pu
       LEFT JOIN projects p ON p.id = pu.project_id
       LEFT JOIN vendors v ON v.id = pu.vendor_id
       WHERE pu.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '매입 내역을 찾을 수 없습니다' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create purchase
router.post('/', async (req, res) => {
  try {
    const { project_id, vendor_id, purchase_date, item_name, quantity, unit, unit_price, total_amount, tax_amount, supply_amount, payment_status, notes } = req.body;
    if (!purchase_date || !item_name) return res.status(400).json({ error: '날짜와 품목명은 필수입니다' });

    const supplyAmt = supply_amount || Math.round((total_amount || 0) / 1.1);
    const taxAmt = tax_amount || (total_amount || 0) - supplyAmt;
    const totalAmt = total_amount || (unit_price || 0) * (quantity || 1);

    const result = await pool.query(
      `INSERT INTO purchases (project_id, vendor_id, purchase_date, item_name, quantity, unit, unit_price, total_amount, tax_amount, supply_amount, payment_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [project_id, vendor_id, purchase_date, item_name, quantity || 1, unit || '식', unit_price || 0, totalAmt, taxAmt, supplyAmt, payment_status || '미결제', notes]
    );
    res.json({ id: result.rows[0].id, message: '매입이 등록되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update purchase
router.put('/:id', async (req, res) => {
  try {
    const { project_id, vendor_id, purchase_date, item_name, quantity, unit, unit_price, total_amount, tax_amount, supply_amount, payment_status, notes } = req.body;
    await pool.query(
      `UPDATE purchases SET project_id = $1, vendor_id = $2, purchase_date = $3, item_name = $4,
       quantity = $5, unit = $6, unit_price = $7, total_amount = $8, tax_amount = $9, supply_amount = $10,
       payment_status = $11, notes = $12
       WHERE id = $13`,
      [project_id, vendor_id, purchase_date, item_name, quantity, unit, unit_price, total_amount, tax_amount, supply_amount, payment_status, notes, req.params.id]
    );
    res.json({ message: '매입이 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE purchase
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM purchases WHERE id = $1', [req.params.id]);
    res.json({ message: '매입이 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
