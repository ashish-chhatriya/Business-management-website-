const pool = require('./pool');

async function ensureShopSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shops (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      domain_id UUID NOT NULL REFERENCES domains(id),
      name VARCHAR(120) NOT NULL,
      address TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(domain_id, name)
    );

    ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id);

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id);

    CREATE INDEX IF NOT EXISTS idx_shops_domain ON shops(domain_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_sales_domain_shop_date ON sales(domain_id, shop_id, sale_date);
    CREATE INDEX IF NOT EXISTS idx_users_shop ON users(shop_id);

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

    CREATE INDEX IF NOT EXISTS idx_salary_matrix_domain_year ON salary_matrix(domain_id, pay_year);
  `);

  await pool.query(`
    INSERT INTO shops (domain_id, name)
    SELECT d.id, seed.name
    FROM domains d
    CROSS JOIN (VALUES ('Main Branch'), ('Railway Road Branch'), ('Bus Stand Branch')) AS seed(name)
    ON CONFLICT (domain_id, name) DO NOTHING
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='salary_payments'
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
}

module.exports = ensureShopSchema;
