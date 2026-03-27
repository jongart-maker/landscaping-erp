const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET all vendors
router.get('/', async (req, res) => {
  try {
    const { vendor_type } = req.query;
    let query = 'SELECT * FROM vendors';
    const params = [];
    if (vendor_type) {
      query += ' WHERE vendor_type = $1';
      params.push(vendor_type);
    }
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single vendor
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vendors WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '거래처를 찾을 수 없습니다' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create vendor
router.post('/', async (req, res) => {
  try {
    const { name, business_number, representative, address, phone, email, bank_name, bank_account, account_holder, vendor_type, notes } = req.body;
    if (!name) return res.status(400).json({ error: '거래처명은 필수입니다' });

    const result = await pool.query(
      `INSERT INTO vendors (name, business_number, representative, address, phone, email, bank_name, bank_account, account_holder, vendor_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [name, business_number, representative, address, phone, email, bank_name, bank_account, account_holder, vendor_type || '자재', notes]
    );
    res.json({ id: result.rows[0].id, message: '거래처가 등록되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update vendor
router.put('/:id', async (req, res) => {
  try {
    const { name, business_number, representative, address, phone, email, bank_name, bank_account, account_holder, vendor_type, notes } = req.body;
    await pool.query(
      `UPDATE vendors SET name = $1, business_number = $2, representative = $3, address = $4, phone = $5,
       email = $6, bank_name = $7, bank_account = $8, account_holder = $9, vendor_type = $10, notes = $11
       WHERE id = $12`,
      [name, business_number, representative, address, phone, email, bank_name, bank_account, account_holder, vendor_type, notes, req.params.id]
    );
    res.json({ message: '거래처가 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE vendor
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM vendors WHERE id = $1', [req.params.id]);
    res.json({ message: '거래처가 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
