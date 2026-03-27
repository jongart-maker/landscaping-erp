const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET all employees
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM employees';
    const params = [];
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single employee
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '직원을 찾을 수 없습니다' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create employee
router.post('/', async (req, res) => {
  try {
    const { name, employee_number, position, department, hire_date, birth_date, phone, address, bank_name, bank_account, base_salary, employment_type, status, resident_number, notes } = req.body;
    if (!name) return res.status(400).json({ error: '직원명은 필수입니다' });

    const result = await pool.query(
      `INSERT INTO employees (name, employee_number, position, department, hire_date, birth_date, phone, address, bank_name, bank_account, base_salary, employment_type, status, resident_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
      [name, employee_number, position, department, hire_date, birth_date, phone, address, bank_name, bank_account, base_salary || 0, employment_type || '정규직', status || '재직', resident_number, notes]
    );
    res.json({ id: result.rows[0].id, message: '직원이 등록되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update employee
router.put('/:id', async (req, res) => {
  try {
    const { name, employee_number, position, department, hire_date, birth_date, phone, address, bank_name, bank_account, base_salary, employment_type, status, resident_number, notes } = req.body;
    await pool.query(
      `UPDATE employees SET name = $1, employee_number = $2, position = $3, department = $4, hire_date = $5,
       birth_date = $6, phone = $7, address = $8, bank_name = $9, bank_account = $10, base_salary = $11,
       employment_type = $12, status = $13, resident_number = $14, notes = $15
       WHERE id = $16`,
      [name, employee_number, position, department, hire_date, birth_date, phone, address, bank_name, bank_account, base_salary, employment_type, status, resident_number, notes, req.params.id]
    );
    res.json({ message: '직원 정보가 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE employee
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    res.json({ message: '직원이 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
