require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Migrating salary matrix schema...');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_matrix (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        domain_id UUID NOT NULL REFERENCES domains(id),
        employee_id UUID NOT NULL REFERENCES employees(id),
        pay_year VARCHAR(4) NOT NULL,
        pay_month VARCHAR(7) NOT NULL,
        is_paid BOOLEAN NOT NULL DEFAULT FALSE,
        paid_at TIMESTAMPTZ,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(domain_id, employee_id, pay_month)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_salary_matrix_domain_year ON salary_matrix(domain_id, pay_year);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'salary_payments'
        ) THEN
          INSERT INTO salary_matrix (id, domain_id, employee_id, pay_year, pay_month, is_paid, paid_at, created_by, updated_by, created_at, updated_at)
          SELECT uuid_generate_v4(), domain_id, employee_id, substring(pay_month from 1 for 4), pay_month, is_paid, paid_at, created_by, updated_by, created_at, updated_at
          FROM salary_payments sp
          WHERE NOT EXISTS (
            SELECT 1 FROM salary_matrix sm
            WHERE sm.domain_id = sp.domain_id
              AND sm.employee_id = sp.employee_id
              AND sm.pay_month = sp.pay_month
          );
        END IF;
      END $$;
    `);

    await client.query('COMMIT');
    console.log('Salary matrix migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
