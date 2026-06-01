require('dotenv').config();
const pool = require('./pool');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding database...');
    await client.query('BEGIN');

    // ── Domains ──
    const domain1Id = uuidv4();
    const domain2Id = uuidv4();
    await client.query(`
      INSERT INTO domains (id, name, slug, address, phone) VALUES
      ($1, 'QuickBite - Andheri Branch', 'andheri', 'Shop 12, Link Road, Andheri West, Mumbai', '9900001111'),
      ($2, 'QuickBite - Bandra Branch', 'bandra', 'Shop 4, Hill Road, Bandra West, Mumbai', '9900002222')
      ON CONFLICT (slug) DO NOTHING
    `, [domain1Id, domain2Id]);

    // Fetch real IDs after potential conflict skip
    const { rows: domains } = await client.query('SELECT id, slug FROM domains ORDER BY created_at');
    const d1 = domains.find(d => d.slug === 'andheri')?.id;
    const d2 = domains.find(d => d.slug === 'bandra')?.id;

    // ── Users ──
    const hash = await bcrypt.hash('Admin@123', 12);
    const mgrHash = await bcrypt.hash('Manager@123', 12);

    await client.query(`
      INSERT INTO users (id, domain_id, name, email, password_hash, role) VALUES
      ($1, $2, 'Admin Andheri', 'admin@andheri.quickbite.com', $3, 'admin'),
      ($4, $2, 'Rahul Manager', 'manager@andheri.quickbite.com', $5, 'manager'),
      ($6, $7, 'Admin Bandra', 'admin@bandra.quickbite.com', $3, 'admin'),
      ($8, $7, 'Priya Manager', 'manager@bandra.quickbite.com', $5, 'manager'),
      ($9, $2, 'Super Admin', 'superadmin@quickbite.com', $3, 'superadmin')
      ON CONFLICT (email) DO NOTHING
    `, [uuidv4(), d1, hash, uuidv4(), mgrHash, uuidv4(), d2, uuidv4(), uuidv4()]);

    const { rows: users } = await client.query('SELECT id, domain_id, role FROM users');
    const adminD1 = users.find(u => u.domain_id === d1 && u.role === 'admin')?.id;
    const adminD2 = users.find(u => u.domain_id === d2 && u.role === 'admin')?.id;

    // ── Employees ──
    const empData = [
      [uuidv4(), d1, 'EMP-001', 'Rahul Sharma', '9876543210', 'Manager', 35000, '2024-01-15', 'FP-001'],
      [uuidv4(), d1, 'EMP-002', 'Priya Patel', '9765432109', 'Cashier', 18000, '2024-03-01', 'FP-002'],
      [uuidv4(), d1, 'EMP-003', 'Suresh Kumar', '9654321098', 'Cook', 22000, '2024-02-20', 'FP-003'],
      [uuidv4(), d1, 'EMP-004', 'Anita Devi', '9543210987', 'Cook', 22000, '2024-04-10', 'FP-004'],
      [uuidv4(), d1, 'EMP-005', 'Mohammed Ali', '9432109876', 'Delivery', 16000, '2024-06-05', 'FP-005'],
      [uuidv4(), d1, 'EMP-006', 'Kavita Singh', '9321098765', 'Cleaner', 14000, '2024-07-12', 'FP-006'],
      [uuidv4(), d2, 'EMP-001', 'Deepak Mehta', '9110001111', 'Manager', 32000, '2024-02-01', 'FP-010'],
      [uuidv4(), d2, 'EMP-002', 'Sunita Rao', '9220002222', 'Cashier', 17000, '2024-04-15', 'FP-011'],
    ];
    for (const [id, did, code, name, phone, desig, sal, jdate, fp] of empData) {
      await client.query(`
        INSERT INTO employees (id, domain_id, emp_code, name, phone, designation, monthly_salary, joining_date, fingerprint_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (domain_id, emp_code) DO NOTHING
      `, [id, did, code, name, phone, desig, sal, jdate, fp, did === d1 ? adminD1 : adminD2]);
    }

    // ── Inventory ──
    const invItems = [
      ['Chicken Breast', 8, 15, 'kg'],
      ['Burger Buns', 60, 100, 'pcs'],
      ['Cooking Oil', 5, 20, 'L'],
      ['Cheese Slices', 40, 50, 'pcs'],
      ['Potato (Fresh)', 25, 30, 'kg'],
      ['Tomato Sauce', 12, 15, 'bottles'],
      ['Paneer', 3, 10, 'kg'],
      ['Bread', 80, 100, 'pcs'],
      ['Green Chutney', 6, 8, 'kg'],
    ];
    for (const [name, curr, min, unit] of invItems) {
      await client.query(`
        INSERT INTO inventory (id, domain_id, ingredient_name, current_stock, minimum_stock, unit)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (domain_id, ingredient_name) DO NOTHING
      `, [uuidv4(), d1, name, curr, min, unit]);
    }

    // ── Sales (last 10 days) ──
    const items = [
      { name: 'Chicken Burger', price: 120 },
      { name: 'Veg Pizza (6")', price: 180 },
      { name: 'Masala Fries', price: 80 },
      { name: 'Aloo Tikki Burger', price: 90 },
      { name: 'Cold Coffee', price: 70 },
      { name: 'Paneer Wrap', price: 130 },
      { name: 'Chicken Roll', price: 110 },
      { name: 'Veg Burger', price: 85 },
    ];
    const modes = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
    let saleSeq = 800;
    for (let d = 10; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      const count = 6 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i++) {
        const item = items[Math.floor(Math.random() * items.length)];
        const qty = 1 + Math.floor(Math.random() * 4);
        const hr = 9 + Math.floor(Math.random() * 10);
        const min = Math.floor(Math.random() * 60);
        saleSeq++;
        await client.query(`
          INSERT INTO sales (id, domain_id, sale_code, sale_date, sale_time, item_name, quantity, price_per_unit, payment_mode, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING
        `, [uuidv4(), d1, `SL-${saleSeq}`, dateStr, `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`,
            item.name, qty, item.price, modes[Math.floor(Math.random() * modes.length)], adminD1]);
      }
    }

    // ── Expenses ──
    const expCats = [
      { cat: 'Rent', amt: 25000 },
      { cat: 'Electricity', amt: 4200 },
      { cat: 'Water', amt: 800 },
      { cat: 'Gas', amt: 1800 },
      { cat: 'Maintenance', amt: 1500 },
    ];
    let expSeq = 300;
    for (const { cat, amt } of expCats) {
      expSeq++;
      const today = new Date().toISOString().split('T')[0];
      await client.query(`
        INSERT INTO expenses (id, domain_id, expense_code, category, amount, expense_date, expense_time, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING
      `, [uuidv4(), d1, `EXP-${expSeq}`, cat, amt, today, '09:00:00', `Monthly ${cat.toLowerCase()}`, adminD1]);
    }

    // ── Attendance (today) ──
    const { rows: emps } = await client.query('SELECT id FROM employees WHERE domain_id=$1 AND is_deleted=FALSE', [d1]);
    const today = new Date().toISOString().split('T')[0];
    const attStatuses = ['present', 'present', 'present', 'present', 'half_day', 'absent'];
    for (let i = 0; i < emps.length; i++) {
      const s = attStatuses[i % attStatuses.length];
      await client.query(`
        INSERT INTO attendance (id, domain_id, employee_id, att_date, check_in, check_out, working_hours, status, source, marked_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (domain_id, employee_id, att_date) DO NOTHING
      `, [uuidv4(), d1, emps[i].id, today,
          s !== 'absent' ? '09:08:00' : null,
          s === 'present' ? '18:25:00' : s === 'half_day' ? '14:00:00' : null,
          s === 'present' ? 9.28 : s === 'half_day' ? 4.87 : 0,
          s, 'manual', adminD1]);
    }

    await client.query('COMMIT');
    console.log('✅ Seed complete!');
    console.log('\n📋 Demo Credentials:');
    console.log('  Super Admin : superadmin@quickbite.com / Admin@123');
    console.log('  Admin       : admin@andheri.quickbite.com / Admin@123');
    console.log('  Manager     : manager@andheri.quickbite.com / Manager@123');
    console.log('  Admin (B2)  : admin@bandra.quickbite.com / Admin@123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
