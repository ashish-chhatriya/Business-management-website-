require('dotenv').config();
const pool = require('./pool');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const client = await pool.connect();
  try {
console.log('Seeding demo data...');
    await client.query('BEGIN');

    const domainId = uuidv4();
    await client.query(`
      INSERT INTO domains (id, name, slug, address, phone)
      VALUES ($1, 'Business Management', 'business-management', 'Business Headquarters', '')
      ON CONFLICT (slug) DO UPDATE SET
        name=EXCLUDED.name,
        address=EXCLUDED.address,
        phone=EXCLUDED.phone,
        is_active=TRUE
    `, [domainId]);

    const { rows: domains } = await client.query(`SELECT id FROM domains WHERE slug='business-management' LIMIT 1`);
    const d1 = domains[0].id;

    // Ensure users role constraint includes 'superadmin' in case older schema misses it
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`);
    await client.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin','admin','manager','employee'));`);

    const ownerHash = await bcrypt.hash('Admin123!', 12);
    const employeeHash = await bcrypt.hash('Employee123!', 12);
    const customHash = await bcrypt.hash('samjhana4806', 12);

    await client.query(`
      INSERT INTO users (id, domain_id, name, email, password_hash, role) VALUES
      ($1, $2, 'Owner', 'owner@business.local', $3, 'superadmin'),
      ($4, $2, 'Employee One', 'employee1@business.local', $5, 'employee'),
      ($6, $2, 'Employee Two', 'employee2@business.local', $5, 'employee'),
      ($7, $2, 'Employee Three', 'employee3@business.local', $5, 'employee'),
      ($8, $2, 'Superadmin Ashish', 'superadmin@123', $9, 'superadmin')
      ON CONFLICT (email) DO UPDATE SET
        name=EXCLUDED.name,
        domain_id=EXCLUDED.domain_id,
        role=EXCLUDED.role,
        password_hash=EXCLUDED.password_hash,
        is_active=TRUE
    `, [uuidv4(), d1, ownerHash, uuidv4(), employeeHash, uuidv4(), uuidv4(), uuidv4(), customHash]);

    const { rows: ownerRows } = await client.query(`SELECT id FROM users WHERE email='owner@business.local' LIMIT 1`);
    const ownerId = ownerRows[0].id;

    const shopData = [
      ['Mayur Vihar', 'Mayur Vihar'],
      ['Pankaj Plaza', 'Pankaj Plaza'],
    ];
    const shopIds = {};
    for (const [name, address] of shopData) {
      const { rows } = await client.query(`
        INSERT INTO shops (id, domain_id, name, address, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (domain_id, name) DO UPDATE SET
          address=EXCLUDED.address,
          is_active=TRUE,
          updated_at=NOW()
        RETURNING id, name
      `, [uuidv4(), d1, name, address]);
      shopIds[name] = rows[0].id;
    }

    const employees = [
      ['EMP-001', 'Samjhana', 'Team Member', 18000, 'FP-001'],
      ['EMP-002', 'Anugrah', 'Team Member', 18000, 'FP-002'],
      ['EMP-003', 'Ashish', 'Team Member', 18000, 'FP-003'],
    ];
    for (const [code, name, desig, salary, fp] of employees) {
      await client.query(`
        INSERT INTO employees (id, domain_id, emp_code, name, designation, monthly_salary, joining_date, fingerprint_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8)
        ON CONFLICT (domain_id, emp_code) DO UPDATE SET
          name=EXCLUDED.name,
          designation=EXCLUDED.designation,
          monthly_salary=EXCLUDED.monthly_salary,
          fingerprint_id=EXCLUDED.fingerprint_id,
          status='active',
          is_deleted=FALSE,
          updated_at=NOW()
      `, [uuidv4(), d1, code, name, desig, salary, fp, ownerId]);
    }

    const invItems = [
      ['Non Veg Momos', 120, 30, 'plates'],
      ['Veg Momos', 120, 30, 'plates'],
      ['Paneer Momos', 90, 25, 'plates'],
      ['Momo Wrappers', 500, 100, 'pcs'],
      ['Momo Chutney', 18, 5, 'kg'],
      ['Cooking Oil', 12, 5, 'L'],
    ];
    for (const [name, curr, min, unit] of invItems) {
      await client.query(`
        INSERT INTO inventory (id, domain_id, ingredient_name, current_stock, minimum_stock, unit)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (domain_id, ingredient_name) DO UPDATE SET
          current_stock=EXCLUDED.current_stock,
          minimum_stock=EXCLUDED.minimum_stock,
          unit=EXCLUDED.unit,
          updated_at=NOW()
      `, [uuidv4(), d1, name, curr, min, unit]);
    }

    const menuItems = [
      { name: 'Non Veg Momos', price: 90 },
      { name: 'Veg Momos', price: 70 },
      { name: 'Paneer Momos', price: 85 },
    ];
    const modes = ['Cash', 'UPI', 'Card'];
    let saleSeq = 1000;
    for (let d = 10; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      for (const shopName of Object.keys(shopIds)) {
        for (let i = 0; i < 3; i++) {
          const item = menuItems[(i + d) % menuItems.length];
          const qty = 1 + ((i + d) % 4);
          const hr = 12 + ((i + d) % 8);
          const min = (15 + i * 11) % 60;
          saleSeq++;
          await client.query(`
            INSERT INTO sales (id, domain_id, shop_id, sale_code, sale_date, sale_time, item_name, quantity, price_per_unit, payment_mode, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT DO NOTHING
          `, [uuidv4(), d1, shopIds[shopName], `SL-${saleSeq}`, dateStr, `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`, item.name, qty, item.price, modes[(i + d) % modes.length], ownerId]);
        }
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const expenses = [
      { category: 'Gas', quantity: 2, unit: 'Cylinders', unit_price: 1200, is_paid: true },
      { category: 'Electricity', quantity: 1, unit: 'Bill', unit_price: 3500, is_paid: true },
      { category: 'Eggs', quantity: 30, unit: 'Trays', unit_price: 180, is_paid: true },
      { category: 'Chicken', quantity: 5, unit: 'Kg', unit_price: 280, is_paid: false },
      { category: 'Oil', quantity: 10, unit: 'Liters', unit_price: 120, is_paid: true },
      { category: 'Rent', quantity: 1, unit: 'Month', unit_price: 18000, is_paid: true },
      { category: 'Internet', quantity: 1, unit: 'Month', unit_price: 1500, is_paid: true },
      { category: 'Staff Food', quantity: 5, unit: 'Meals', unit_price: 100, is_paid: true },
    ];
    let expSeq = 500;
    for (const exp of expenses) {
      expSeq++;
      const total = exp.quantity * exp.unit_price;
      await client.query(`
        INSERT INTO expenses (id, domain_id, expense_code, category, amount, quantity, unit, unit_price, expense_date, expense_time, is_paid, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT DO NOTHING
      `, [uuidv4(), d1, `EXP-${expSeq}`, exp.category, total, exp.quantity, exp.unit, exp.unit_price, today, '09:00:00', exp.is_paid, `Business Management - ${exp.category}`, ownerId]);
    }

    const { rows: emps } = await client.query('SELECT id, name FROM employees WHERE domain_id=$1 AND is_deleted=FALSE ORDER BY emp_code', [d1]);
    for (let i = 0; i < emps.length; i++) {
      await client.query(`
        INSERT INTO attendance (id, domain_id, employee_id, att_date, check_in, check_out, working_hours, status, source, marked_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (domain_id, employee_id, att_date) DO UPDATE SET
          check_in=EXCLUDED.check_in,
          check_out=EXCLUDED.check_out,
          working_hours=EXCLUDED.working_hours,
          status=EXCLUDED.status,
          marked_by=EXCLUDED.marked_by,
          updated_at=NOW()
      `, [uuidv4(), d1, emps[i].id, today, '10:00:00', '20:00:00', 10, 'present', 'manual', ownerId]);
    }

    await client.query('COMMIT');
    console.log('Seed complete.');
    console.log('\nDemo Credentials:');
    console.log('  Demo user accounts seeded. Use the registered email and password rules to log in.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));