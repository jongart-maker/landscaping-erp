require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initializeSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        client TEXT NOT NULL,
        location TEXT,
        start_date TEXT,
        end_date TEXT,
        contract_amount INTEGER DEFAULT 0,
        status TEXT DEFAULT '진행중',
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        contract_type TEXT DEFAULT '본계약',
        contract_date TEXT,
        amount INTEGER DEFAULT 0,
        labor_budget INTEGER DEFAULT 0,
        equipment_budget INTEGER DEFAULT 0,
        material_budget INTEGER DEFAULT 0,
        overhead_budget INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dailylogs (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        log_date TEXT NOT NULL,
        weather TEXT DEFAULT '맑음',
        work_description TEXT,
        total_labor_cost INTEGER DEFAULT 0,
        total_equipment_cost INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS labor (
        id SERIAL PRIMARY KEY,
        dailylog_id INTEGER NOT NULL,
        worker_type TEXT NOT NULL,
        count NUMERIC DEFAULT 1,
        unit_price INTEGER DEFAULT 0,
        total_price INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (dailylog_id) REFERENCES dailylogs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS equipment (
        id SERIAL PRIMARY KEY,
        dailylog_id INTEGER NOT NULL,
        equipment_type TEXT NOT NULL,
        count NUMERIC DEFAULT 1,
        unit_price INTEGER DEFAULT 0,
        total_price INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (dailylog_id) REFERENCES dailylogs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        dailylog_id INTEGER,
        project_id INTEGER,
        filename TEXT NOT NULL,
        original_name TEXT,
        file_path TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (dailylog_id) REFERENCES dailylogs(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        business_number TEXT,
        representative TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        bank_name TEXT,
        bank_account TEXT,
        account_holder TEXT,
        vendor_type TEXT DEFAULT '자재',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        vendor_id INTEGER,
        purchase_date TEXT NOT NULL,
        item_name TEXT NOT NULL,
        quantity NUMERIC DEFAULT 1,
        unit TEXT DEFAULT '식',
        unit_price INTEGER DEFAULT 0,
        total_amount INTEGER DEFAULT 0,
        tax_amount INTEGER DEFAULT 0,
        supply_amount INTEGER DEFAULT 0,
        payment_status TEXT DEFAULT '미결제',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS taxinvoices (
        id SERIAL PRIMARY KEY,
        invoice_type TEXT NOT NULL,
        project_id INTEGER,
        vendor_id INTEGER,
        issue_date TEXT,
        supply_amount INTEGER DEFAULT 0,
        tax_amount INTEGER DEFAULT 0,
        total_amount INTEGER DEFAULT 0,
        status TEXT DEFAULT '미발행',
        invoice_number TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS progressbills (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        bill_date TEXT NOT NULL,
        bill_number TEXT,
        progress_rate NUMERIC DEFAULT 0,
        bill_amount INTEGER DEFAULT 0,
        supply_amount INTEGER DEFAULT 0,
        tax_amount INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        progressbill_id INTEGER,
        payment_date TEXT,
        amount INTEGER DEFAULT 0,
        payment_method TEXT DEFAULT '계좌이체',
        is_received INTEGER DEFAULT 0,
        due_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (progressbill_id) REFERENCES progressbills(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        employee_number TEXT,
        position TEXT,
        department TEXT,
        hire_date TEXT,
        birth_date TEXT,
        phone TEXT,
        address TEXT,
        bank_name TEXT,
        bank_account TEXT,
        base_salary INTEGER DEFAULT 0,
        employment_type TEXT DEFAULT '정규직',
        status TEXT DEFAULT '재직',
        resident_number TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        project_id INTEGER,
        work_date TEXT NOT NULL,
        check_in TEXT,
        check_out TEXT,
        work_hours NUMERIC DEFAULT 8,
        overtime_hours NUMERIC DEFAULT 0,
        attendance_type TEXT DEFAULT '정상',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS salary (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        year_month TEXT NOT NULL,
        base_salary INTEGER DEFAULT 0,
        overtime_pay INTEGER DEFAULT 0,
        bonus INTEGER DEFAULT 0,
        total_gross INTEGER DEFAULT 0,
        national_pension INTEGER DEFAULT 0,
        health_insurance INTEGER DEFAULT 0,
        employment_insurance INTEGER DEFAULT 0,
        income_tax INTEGER DEFAULT 0,
        local_income_tax INTEGER DEFAULT 0,
        total_deductions INTEGER DEFAULT 0,
        net_salary INTEGER DEFAULT 0,
        payment_date TEXT,
        payment_status TEXT DEFAULT '미지급',
        work_days NUMERIC DEFAULT 0,
        overtime_total NUMERIC DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS defects (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        defect_type TEXT DEFAULT '식재',
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        reported_date TEXT NOT NULL,
        due_date TEXT,
        status TEXT DEFAULT '접수',
        priority TEXT DEFAULT '보통',
        assigned_to TEXT,
        resolution TEXT,
        resolved_date TEXT,
        reporter TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS defectcosts (
        id SERIAL PRIMARY KEY,
        defect_id INTEGER NOT NULL,
        cost_date TEXT,
        cost_type TEXT DEFAULT '자재',
        amount INTEGER DEFAULT 0,
        description TEXT,
        vendor_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS unitprices (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        item_name TEXT NOT NULL,
        unit TEXT DEFAULT '일',
        unit_price INTEGER DEFAULT 0,
        description TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed default unit prices if empty
    const countResult = await client.query('SELECT COUNT(*) as cnt FROM unitprices');
    if (parseInt(countResult.rows[0].cnt) === 0) {
      const seedData = [
        ['인력', '인부', '일', 150000],
        ['인력', '조경공', '일', 200000],
        ['인력', '조경기능사', '일', 230000],
        ['인력', '굴삭기기사', '일', 250000],
        ['인력', '신호수', '일', 140000],
        ['인력', '시설원', '일', 160000],
        ['인력', '반장', '일', 220000],
        ['장비', '굴삭기03', '일', 400000],
        ['장비', '굴삭기06', '일', 550000],
        ['장비', '굴삭기20', '일', 700000],
        ['장비', '스카이차', '일', 350000],
        ['장비', '트럭1톤', '일', 150000],
        ['장비', '트럭5톤', '일', 280000],
        ['장비', '살수차', '일', 250000],
        ['장비', '고소작업차', '일', 400000],
      ];
      for (const [category, item_name, unit, unit_price] of seedData) {
        await client.query(
          'INSERT INTO unitprices (category, item_name, unit, unit_price) VALUES ($1, $2, $3, $4)',
          [category, item_name, unit, unit_price]
        );
      }
      console.log('Default unit prices seeded.');
    }

    console.log('Database schema initialized.');
  } finally {
    client.release();
  }
}

module.exports = { pool, initializeSchema };
