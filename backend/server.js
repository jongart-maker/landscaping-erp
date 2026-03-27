require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initializeSchema } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const projectsRouter = require('./routes/projects');
const dailylogsRouter = require('./routes/dailylogs');
const vendorsRouter = require('./routes/vendors');
const purchasesRouter = require('./routes/purchases');
const taxinvoicesRouter = require('./routes/taxinvoices');
const paymentsRouter = require('./routes/payments');
const employeesRouter = require('./routes/employees');
const attendanceRouter = require('./routes/attendance');
const salaryRouter = require('./routes/salary');
const defectsRouter = require('./routes/defects');
const shareRouter = require('./routes/share');

app.use('/api/projects', projectsRouter);
app.use('/api/dailylogs', dailylogsRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/taxinvoices', taxinvoicesRouter);
app.use('/api', paymentsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/salary', salaryRouter);
app.use('/api/defects', defectsRouter);
app.use('/api/share', shareRouter);

// Dashboard endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${currentYear}-${currentMonth}`;

    const [
      monthlyRevenueResult,
      monthlyCostsResult,
      totalReceivablesResult,
      unpaidDefectsResult,
      expectedSalaryResult,
      uninvoicedResult,
      projectUtilizationResult,
      overdueReceivablesResult,
      upcomingDefectsResult,
    ] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments
         WHERE TO_CHAR(payment_date::date, 'YYYY-MM') = $1 AND is_received = 1`,
        [yearMonth]
      ),
      pool.query(
        `SELECT
          COALESCE((SELECT SUM(total_labor_cost + total_equipment_cost) FROM dailylogs WHERE TO_CHAR(log_date::date, 'YYYY-MM') = $1), 0) +
          COALESCE((SELECT SUM(total_amount) FROM purchases WHERE TO_CHAR(purchase_date::date, 'YYYY-MM') = $1), 0) as total`,
        [yearMonth]
      ),
      pool.query(
        `SELECT COALESCE(SUM(pb.bill_amount) - COALESCE(received.total, 0), 0) as total
         FROM progressbills pb
         LEFT JOIN (
           SELECT project_id, SUM(amount) as total FROM payments WHERE is_received = 1 GROUP BY project_id
         ) received ON pb.project_id = received.project_id`
      ),
      pool.query(`SELECT COUNT(*) as count FROM defects WHERE status NOT IN ('완료')`),
      pool.query(`SELECT COALESCE(SUM(base_salary), 0) as total FROM employees WHERE status = '재직'`),
      pool.query(`SELECT COUNT(*) as count FROM taxinvoices WHERE status = '미발행'`),
      pool.query(
        `SELECT
          p.id, p.name, p.status,
          COALESCE(c.labor_budget + c.equipment_budget + c.material_budget + c.overhead_budget, p.contract_amount) as total_budget,
          COALESCE((SELECT SUM(total_labor_cost + total_equipment_cost) FROM dailylogs WHERE project_id = p.id), 0) +
          COALESCE((SELECT SUM(total_amount) FROM purchases WHERE project_id = p.id), 0) as total_spent
         FROM projects p
         LEFT JOIN contracts c ON c.project_id = p.id
         WHERE p.status = '진행중'
         GROUP BY p.id, p.name, p.status, c.labor_budget, c.equipment_budget, c.material_budget, c.overhead_budget
         LIMIT 10`
      ),
      pool.query(
        `SELECT
          p.name as project_name,
          pb.bill_date,
          pb.bill_amount,
          (CURRENT_DATE - pb.bill_date::date) as days_overdue
         FROM progressbills pb
         JOIN projects p ON p.id = pb.project_id
         WHERE pb.bill_amount > COALESCE(
           (SELECT SUM(amount) FROM payments WHERE project_id = pb.project_id AND is_received = 1), 0
         )
         AND (CURRENT_DATE - pb.bill_date::date) > 90
         ORDER BY days_overdue DESC
         LIMIT 5`
      ),
      pool.query(
        `SELECT
          d.id, d.title, d.due_date, d.status,
          p.name as project_name,
          (d.due_date::date - CURRENT_DATE) as days_until_due
         FROM defects d
         JOIN projects p ON p.id = d.project_id
         WHERE d.status NOT IN ('완료') AND d.due_date IS NOT NULL
         AND (d.due_date::date - CURRENT_DATE) <= 7
         ORDER BY days_until_due ASC
         LIMIT 5`
      ),
    ]);

    // Monthly profit trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const [revResult, costResult] = await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(amount), 0) as total FROM payments
           WHERE TO_CHAR(payment_date::date, 'YYYY-MM') = $1 AND is_received = 1`,
          [ym]
        ),
        pool.query(
          `SELECT
            COALESCE((SELECT SUM(total_labor_cost + total_equipment_cost) FROM dailylogs WHERE TO_CHAR(log_date::date, 'YYYY-MM') = $1), 0) +
            COALESCE((SELECT SUM(total_amount) FROM purchases WHERE TO_CHAR(purchase_date::date, 'YYYY-MM') = $1), 0) as total`,
          [ym]
        ),
      ]);
      const rev = parseInt(revResult.rows[0].total) || 0;
      const cost = parseInt(costResult.rows[0].total) || 0;
      monthlyTrend.push({ month: ym, revenue: rev, cost, profit: rev - cost });
    }

    const monthlyRevenue = parseInt(monthlyRevenueResult.rows[0].total) || 0;
    const monthlyCosts = parseInt(monthlyCostsResult.rows[0].total) || 0;

    res.json({
      monthlyRevenue,
      monthlyCosts,
      monthlyProfit: monthlyRevenue - monthlyCosts,
      totalReceivables: parseInt(totalReceivablesResult.rows[0].total) || 0,
      unpaidDefectsCount: parseInt(unpaidDefectsResult.rows[0].count) || 0,
      expectedSalary: parseInt(expectedSalaryResult.rows[0].total) || 0,
      uninvoicedCount: parseInt(uninvoicedResult.rows[0].count) || 0,
      projectUtilization: projectUtilizationResult.rows,
      monthlyTrend,
      overdueReceivables: overdueReceivablesResult.rows,
      upcomingDefects: upcomingDefectsResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Unit prices routes
app.get('/api/unitprices', async (req, res) => {
  try {
    const { category } = req.query;
    let result;
    if (category) {
      result = await pool.query('SELECT * FROM unitprices WHERE category = $1 ORDER BY id', [category]);
    } else {
      result = await pool.query('SELECT * FROM unitprices ORDER BY category, id');
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/unitprices/:id', async (req, res) => {
  try {
    const { item_name, unit_price, unit, description } = req.body;
    await pool.query(
      `UPDATE unitprices SET item_name = $1, unit_price = $2, unit = $3, description = $4, updated_at = NOW()
       WHERE id = $5`,
      [item_name, unit_price, unit, description, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unitprices', async (req, res) => {
  try {
    const { category, item_name, unit, unit_price, description } = req.body;
    const result = await pool.query(
      `INSERT INTO unitprices (category, item_name, unit, unit_price, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [category, item_name, unit, unit_price, description]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/unitprices/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM unitprices WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
initializeSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Landscaping ERP server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
