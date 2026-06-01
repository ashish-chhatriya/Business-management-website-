require('dotenv').config();
const pool = require('./pool');

const schema = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- DOMAINS / BRANCHES (multi-branch future support)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(50) NOT NULL UNIQUE,
  address TEXT,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- USERS (Admin / Manager per domain)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin','admin','manager')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- EMPLOYEES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  emp_code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  designation VARCHAR(50),
  monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  joining_date DATE,
  fingerprint_id VARCHAR(50),
  photo_url TEXT,
  status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain_id, emp_code)
);

-- ─────────────────────────────────────────────
-- SALES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  sale_code VARCHAR(20) NOT NULL,
  sale_date DATE NOT NULL,
  sale_time TIME NOT NULL,
  item_name VARCHAR(150) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  price_per_unit NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(12,2) GENERATED ALWAYS AS (quantity * price_per_unit) STORED,
  payment_mode VARCHAR(20) CHECK (payment_mode IN ('Cash','UPI','Card','Bank Transfer')),
  notes TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- EXPENSE CATEGORIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  expense_code VARCHAR(20) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('Electricity','Water','Rent','Gas','Maintenance','Repairs','Miscellaneous','Ingredients')),
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  expense_time TIME NOT NULL,
  notes TEXT,
  bill_url TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INGREDIENT PURCHASES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  purchase_code VARCHAR(20) NOT NULL,
  purchase_date DATE NOT NULL,
  purchase_time TIME NOT NULL,
  ingredient_name VARCHAR(100) NOT NULL,
  vendor_name VARCHAR(100),
  quantity NUMERIC(10,2) NOT NULL,
  unit VARCHAR(20),
  price_paid NUMERIC(12,2) NOT NULL,
  bill_number VARCHAR(50),
  notes TEXT,
  bill_url TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INVENTORY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  ingredient_name VARCHAR(100) NOT NULL,
  current_stock NUMERIC(10,2) DEFAULT 0,
  minimum_stock NUMERIC(10,2) DEFAULT 0,
  unit VARCHAR(20),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain_id, ingredient_name)
);

-- ─────────────────────────────────────────────
-- ATTENDANCE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  att_date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  working_hours NUMERIC(5,2),
  status VARCHAR(15) DEFAULT 'present' CHECK (status IN ('present','absent','half_day')),
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('biometric','manual')),
  half_day_reason TEXT,
  marked_by UUID REFERENCES users(id),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain_id, employee_id, att_date)
);

-- ─────────────────────────────────────────────
-- SALARY PAYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  pay_month VARCHAR(7) NOT NULL,
  base_salary NUMERIC(12,2) NOT NULL,
  present_days INTEGER DEFAULT 0,
  half_days INTEGER DEFAULT 0,
  absent_days INTEGER DEFAULT 0,
  bonus NUMERIC(12,2) DEFAULT 0,
  advance_deduction NUMERIC(12,2) DEFAULT 0,
  other_deductions NUMERIC(12,2) DEFAULT 0,
  final_amount NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(20),
  notes TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain_id, employee_id, pay_month)
);

-- ─────────────────────────────────────────────
-- EMPLOYEE ADVANCES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  amount NUMERIC(12,2) NOT NULL,
  advance_date DATE NOT NULL,
  reason TEXT,
  is_deducted BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id),
  user_id UUID REFERENCES users(id),
  user_name VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  module VARCHAR(50),
  record_id UUID,
  details TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_domain_date ON sales(domain_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_expenses_domain_date ON expenses(domain_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_attendance_domain_date ON attendance(domain_id, att_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_domain_month ON salary_payments(domain_id, pay_month);
CREATE INDEX IF NOT EXISTS idx_audit_domain ON audit_logs(domain_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_purchases_domain_date ON purchases(domain_id, purchase_date);
`;

async function setup() {
  const client = await pool.connect();
  try {
    console.log('🔧 Running database setup...');
    await client.query(schema);
    console.log('✅ Database schema created successfully');
  } catch (err) {
    console.error('❌ Schema setup failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch(() => process.exit(1));
