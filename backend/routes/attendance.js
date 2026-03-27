const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET attendance records
router.get('/', async (req, res) => {
  try {
    const { employeeId, projectId, month } = req.query;
    let query = `
      SELECT a.*, e.name as employee_name, e.position, p.name as project_name
      FROM attendance a
      LEFT JOIN employees e ON e.id = a.employee_id
      LEFT JOIN projects p ON p.id = a.project_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (employeeId) { query += ` AND a.employee_id = $${idx++}`; params.push(employeeId); }
    if (projectId) { query += ` AND a.project_id = $${idx++}`; params.push(projectId); }
    if (month) { query += ` AND TO_CHAR(a.work_date::date, 'YYYY-MM') = $${idx++}`; params.push(month); }
    query += ' ORDER BY a.work_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single attendance
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, e.name as employee_name, p.name as project_name
       FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '출결 내역을 찾을 수 없습니다' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create attendance
router.post('/', async (req, res) => {
  try {
    const { employee_id, project_id, work_date, check_in, check_out, work_hours, overtime_hours, attendance_type, notes } = req.body;
    if (!employee_id || !work_date) return res.status(400).json({ error: '직원과 날짜는 필수입니다' });

    const result = await pool.query(
      `INSERT INTO attendance (employee_id, project_id, work_date, check_in, check_out, work_hours, overtime_hours, attendance_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [employee_id, project_id, work_date, check_in, check_out, work_hours || 8, overtime_hours || 0, attendance_type || '정상', notes]
    );
    res.json({ id: result.rows[0].id, message: '출결이 등록되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update attendance
router.put('/:id', async (req, res) => {
  try {
    const { employee_id, project_id, work_date, check_in, check_out, work_hours, overtime_hours, attendance_type, notes } = req.body;
    await pool.query(
      `UPDATE attendance SET employee_id = $1, project_id = $2, work_date = $3, check_in = $4,
       check_out = $5, work_hours = $6, overtime_hours = $7, attendance_type = $8, notes = $9
       WHERE id = $10`,
      [employee_id, project_id, work_date, check_in, check_out, work_hours, overtime_hours, attendance_type, notes, req.params.id]
    );
    res.json({ message: '출결이 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE attendance
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM attendance WHERE id = $1', [req.params.id]);
    res.json({ message: '출결이 삭제되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET monthly attendance summary by employee
router.get('/summary/monthly', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: '월을 지정해주세요' });

    const result = await pool.query(
      `SELECT
        e.id as employee_id,
        e.name as employee_name,
        e.position,
        e.base_salary,
        COUNT(CASE WHEN a.attendance_type = '정상' THEN 1 END) as normal_days,
        COUNT(CASE WHEN a.attendance_type = '반차' THEN 1 END) as half_days,
        COUNT(CASE WHEN a.attendance_type = '결근' THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.attendance_type = '휴가' THEN 1 END) as vacation_days,
        COALESCE(SUM(a.overtime_hours), 0) as total_overtime,
        COUNT(a.id) as total_records
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.id AND TO_CHAR(a.work_date::date, 'YYYY-MM') = $1
       WHERE e.status = '재직'
       GROUP BY e.id
       ORDER BY e.name`,
      [month]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
