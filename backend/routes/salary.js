const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// GET salary records
router.get('/', async (req, res) => {
  try {
    const { employeeId, yearMonth } = req.query;
    let query = `
      SELECT s.*, e.name as employee_name, e.position, e.department
      FROM salary s
      LEFT JOIN employees e ON e.id = s.employee_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (employeeId) { query += ` AND s.employee_id = $${idx++}`; params.push(employeeId); }
    if (yearMonth) { query += ` AND s.year_month = $${idx++}`; params.push(yearMonth); }
    query += ' ORDER BY s.year_month DESC, e.name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST calculate salary from attendance
router.post('/calculate', async (req, res) => {
  const client = await pool.connect();
  try {
    const { yearMonth } = req.body;
    if (!yearMonth) return res.status(400).json({ error: '연월은 필수입니다 (YYYY-MM)' });

    const employeesResult = await client.query('SELECT * FROM employees WHERE status = $1', ['재직']);
    const employees = employeesResult.rows;

    const calculateInsurance = (salary) => {
      const nationalPension = Math.round(salary * 0.045);
      const healthInsurance = Math.round(salary * 0.03545);
      const longTermCare = Math.round(healthInsurance * 0.1281);
      const employmentInsurance = Math.round(salary * 0.009);
      const incomeTax = Math.round(salary * 0.033);
      const localIncomeTax = Math.round(incomeTax * 0.1);
      return { nationalPension, healthInsurance: healthInsurance + longTermCare, employmentInsurance, incomeTax, localIncomeTax };
    };

    const results = [];
    await client.query('BEGIN');

    for (const emp of employees) {
      const attResult = await client.query(
        `SELECT
          COUNT(CASE WHEN attendance_type = '정상' THEN 1 END) as normal_days,
          COUNT(CASE WHEN attendance_type = '반차' THEN 1 END) as half_days,
          COUNT(CASE WHEN attendance_type = '결근' THEN 1 END) as absent_days,
          COALESCE(SUM(overtime_hours), 0) as total_overtime
         FROM attendance
         WHERE employee_id = $1 AND TO_CHAR(work_date::date, 'YYYY-MM') = $2`,
        [emp.id, yearMonth]
      );
      const attSummary = attResult.rows[0];

      const workDays = (parseInt(attSummary.normal_days) || 0) + (parseInt(attSummary.half_days) || 0) * 0.5;
      const baseDailyRate = emp.base_salary / 22;
      const basePay = Math.round(baseDailyRate * workDays);
      const overtimePay = Math.round((baseDailyRate / 8) * 1.5 * (parseFloat(attSummary.total_overtime) || 0));
      const grossSalary = basePay + overtimePay;

      const insurance = calculateInsurance(grossSalary);
      const totalDeductions = insurance.nationalPension + insurance.healthInsurance + insurance.employmentInsurance + insurance.incomeTax + insurance.localIncomeTax;
      const netSalary = grossSalary - totalDeductions;

      const existingResult = await client.query(
        'SELECT id FROM salary WHERE employee_id = $1 AND year_month = $2',
        [emp.id, yearMonth]
      );

      if (existingResult.rows.length > 0) {
        await client.query(
          `UPDATE salary SET base_salary = $1, overtime_pay = $2, total_gross = $3,
           national_pension = $4, health_insurance = $5, employment_insurance = $6,
           income_tax = $7, local_income_tax = $8, total_deductions = $9, net_salary = $10,
           work_days = $11, overtime_total = $12
           WHERE id = $13`,
          [basePay, overtimePay, grossSalary, insurance.nationalPension, insurance.healthInsurance,
            insurance.employmentInsurance, insurance.incomeTax, insurance.localIncomeTax,
            totalDeductions, netSalary, workDays, attSummary.total_overtime || 0, existingResult.rows[0].id]
        );
        results.push({ employee_id: emp.id, name: emp.name, id: existingResult.rows[0].id, action: 'updated' });
      } else {
        const insertResult = await client.query(
          `INSERT INTO salary (employee_id, year_month, base_salary, overtime_pay, total_gross,
           national_pension, health_insurance, employment_insurance, income_tax, local_income_tax,
           total_deductions, net_salary, work_days, overtime_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [emp.id, yearMonth, basePay, overtimePay, grossSalary, insurance.nationalPension,
            insurance.healthInsurance, insurance.employmentInsurance, insurance.incomeTax, insurance.localIncomeTax,
            totalDeductions, netSalary, workDays, attSummary.total_overtime || 0]
        );
        results.push({ employee_id: emp.id, name: emp.name, id: insertResult.rows[0].id, action: 'created' });
      }
    }

    await client.query('COMMIT');
    res.json({ message: '급여가 계산되었습니다', results });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update salary
router.put('/:id', async (req, res) => {
  try {
    const { base_salary, overtime_pay, bonus, total_gross, national_pension, health_insurance, employment_insurance, income_tax, local_income_tax, total_deductions, net_salary, payment_date, payment_status, notes } = req.body;
    await pool.query(
      `UPDATE salary SET base_salary = $1, overtime_pay = $2, bonus = $3, total_gross = $4,
       national_pension = $5, health_insurance = $6, employment_insurance = $7, income_tax = $8,
       local_income_tax = $9, total_deductions = $10, net_salary = $11, payment_date = $12,
       payment_status = $13, notes = $14
       WHERE id = $15`,
      [base_salary, overtime_pay, bonus || 0, total_gross, national_pension, health_insurance,
        employment_insurance, income_tax, local_income_tax, total_deductions, net_salary,
        payment_date, payment_status, notes, req.params.id]
    );
    res.json({ message: '급여가 수정되었습니다' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET salary summary for a month
router.get('/summary/:yearMonth', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) as employee_count,
        SUM(total_gross) as total_gross,
        SUM(total_deductions) as total_deductions,
        SUM(net_salary) as total_net,
        SUM(national_pension) as total_pension,
        SUM(health_insurance) as total_health,
        SUM(employment_insurance) as total_employment,
        SUM(income_tax + local_income_tax) as total_tax
       FROM salary WHERE year_month = $1`,
      [req.params.yearMonth]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
