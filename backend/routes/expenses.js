const router = require('express').Router();
const pool = require('../db/pool');
const { auth, requireAdmin, scopeDomain } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// Default categories — used only for seeding, NOT for validation anymore
const DEFAULT_CATEGORIES = [
  'Gas', 'Electricity', 'Eggs', 'Chicken', 'Oil',
  'Flour', 'Vegetables', 'Rent', 'Internet', 'Staff Food', 'Miscellaneous'
];

// ─── GET /api/expenses/categories ─────────────────────────────────────────────
// Returns all distinct categories ever used by this domain (plus defaults)
router.get('/categories', auth, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT category FROM expenses
       WHERE domain_id=$1 AND is_deleted=FALSE
       ORDER BY category ASC`,
      [req.domainId]
    );
    const used = rows.map(r => r.category);
    // Merge defaults + any custom ones already in the DB, deduplicated
    const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...used])).sort();
    res.json(merged);
  } catch (err) {
    console.error('EXPENSE CATEGORIES ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/expenses ────────────────────────────────────────────────────────
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const { from, to, category, search } = req.query;
    let q = `SELECT e.*, u.name as created_by_name FROM expenses e
             LEFT JOIN users u ON e.created_by = u.id
             WHERE e.domain_id=$1 AND e.is_deleted=FALSE`;
    const params = [req.domainId];

    if (from)     { q += ` AND e.expense_date >= $${params.length+1}`; params.push(from); }
    if (to)       { q += ` AND e.expense_date <= $${params.length+1}`; params.push(to); }
    if (category) { q += ` AND e.category = $${params.length+1}`; params.push(category); }
    if (search)   {
      q += ` AND (e.notes ILIKE $${params.length+1} OR e.expense_code ILIKE $${params.length+1})`;
      params.push(`%${search}%`);
    }

    q += ' ORDER BY e.expense_date DESC, e.expense_time DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error('EXPENSE ERROR:', err);
    return res.status(500).json({
      error: err.message,
      detail: err.detail || null,
      code: err.code || null,
      hint: err.hint || null,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  }
});

// ─── GET /api/expenses/summary ────────────────────────────────────────────────
router.get('/summary', auth, scopeDomain, async (req, res) => {
  try {
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    const yearMonth = d.slice(0, 7);

    const { rows } = await pool.query(`
      SELECT
        category,
        SUM(amount) as total_month,
        SUM(CASE WHEN is_paid = false THEN amount ELSE 0 END) as pending_amount,
        MAX(expense_date) as last_payment_date,
        COUNT(*) as total_records
      FROM expenses
      WHERE domain_id=$1 AND is_deleted=FALSE AND to_char(expense_date,'YYYY-MM') = $2
      GROUP BY category
      ORDER BY total_month DESC
    `, [req.domainId, yearMonth]);

    res.json(rows);
  } catch (err) {
    console.error('EXPENSE ERROR:', err);
    return res.status(500).json({
      error: err.message,
      detail: err.detail || null,
      code: err.code || null,
      hint: err.hint || null,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  }
});

// ─── POST /api/expenses ───────────────────────────────────────────────────────
router.post('/', auth, scopeDomain, async (req, res) => {
  try {
    const {
      category,
      amount,
      quantity,
      unit,
      unit_price,
      expense_date,
      expense_time,
      is_paid,
      notes
    } = req.body;

    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ error: 'amount is required' });
    }

    // Sanitise: trim category, collapse extra spaces, max 50 chars
    const cleanCategory = category.trim().replace(/\s+/g, ' ').slice(0, 50);

    const { rows: last } = await pool.query(
      `SELECT expense_code FROM expenses
       WHERE domain_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [req.domainId]
    );

    const n = last.length
      ? parseInt(last[0].expense_code.replace(/\D/g, '')) + 1
      : 1;
    const code = `EXP-${String(n).padStart(3, '0')}`;

    const now = new Date();

    const { rows } = await pool.query(
      `INSERT INTO expenses (
        id, domain_id, expense_code, category, amount,
        quantity, unit, unit_price, expense_date, expense_time,
        is_paid, notes, created_by
      ) VALUES (
        uuid_generate_v4(),
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      ) RETURNING *`,
      [
        req.domainId,
        code,
        cleanCategory,
        Number(amount),
        quantity || null,
        unit || null,
        unit_price ? Number(unit_price) : null,
        expense_date || now.toISOString().split('T')[0],
        expense_time || now.toTimeString().slice(0, 8),
        Boolean(is_paid),
        notes || null,
        req.user.id
      ]
    );

    await auditLog(
      req.domainId, req.user.id, req.user.name,
      'Expense Added', 'Expenses', rows[0].id,
      `${code}: ${cleanCategory} ₹${amount}`, req.ip
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('EXPENSE CREATE ERROR:', err);
    return res.status(500).json({
      error: err.message,
      detail: err.detail || null,
      code: err.code || null,
      hint: err.hint || null,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  }
});

// ─── PUT /api/expenses/:id ────────────────────────────────────────────────────
router.put('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { category, amount, quantity, unit, unit_price, expense_date, expense_time, is_paid, notes } = req.body;

    // Sanitise category if provided
    const cleanCategory = category ? category.trim().replace(/\s+/g, ' ').slice(0, 50) : null;

    const { rows } = await pool.query(
      `UPDATE expenses SET
        category=COALESCE($1,category),
        amount=COALESCE($2,amount),
        quantity=$3,
        unit=$4,
        unit_price=$5,
        expense_date=COALESCE($6,expense_date),
        expense_time=COALESCE($7,expense_time),
        is_paid=COALESCE($8,is_paid),
        notes=$9,
        updated_by=$10,
        updated_at=NOW()
       WHERE id=$11 AND domain_id=$12 AND is_deleted=FALSE
       RETURNING *`,
      [
        cleanCategory, amount || null, quantity || null, unit || null, unit_price || null,
        expense_date || null, expense_time || null,
        is_paid !== undefined ? is_paid : null,
        notes, req.user.id, req.params.id, req.domainId
      ]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });

    await auditLog(req.domainId, req.user.id, req.user.name,
      'Expense Edited', 'Expenses', rows[0].id,
      `Edited: ${rows[0].expense_code}`, req.ip);

    res.json(rows[0]);
  } catch (err) {
    console.error('EXPENSE ERROR:', err);
    return res.status(500).json({
      error: err.message,
      detail: err.detail || null,
      code: err.code || null,
      hint: err.hint || null,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  }
});

// ─── PATCH /api/expenses/:id/paid ─────────────────────────────────────────────
router.patch('/:id/paid', auth, scopeDomain, async (req, res) => {
  try {
    const { paid } = req.body;
    if (paid === undefined) return res.status(400).json({ error: 'paid status required' });

    const { rows } = await pool.query(
      `UPDATE expenses SET
        is_paid=$1, updated_by=$2, updated_at=NOW()
       WHERE id=$3 AND domain_id=$4 AND is_deleted=FALSE
       RETURNING *`,
      [paid === true, req.user.id, req.params.id, req.domainId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });

    await auditLog(req.domainId, req.user.id, req.user.name,
      `Expense ${paid ? 'Marked Paid' : 'Marked Unpaid'}`, 'Expenses', rows[0].id,
      `${rows[0].expense_code}: ${paid ? 'PAID' : 'UNPAID'}`, req.ip);

    res.json(rows[0]);
  } catch (err) {
    console.error('EXPENSE ERROR:', err);
    return res.status(500).json({
      error: err.message,
      detail: err.detail || null,
      code: err.code || null,
      hint: err.hint || null,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  }
});

// ─── DELETE /api/expenses/:id ─────────────────────────────────────────────────
router.delete('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE expenses SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 AND domain_id=$2 RETURNING expense_code',
      [req.params.id, req.domainId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });

    await auditLog(req.domainId, req.user.id, req.user.name,
      'Expense Deleted', 'Expenses', req.params.id,
      `Deleted: ${rows[0].expense_code}`, req.ip);

    res.json({ success: true });
  } catch (err) {
    console.error('EXPENSE ERROR:', err);
    return res.status(500).json({
      error: err.message,
      detail: err.detail || null,
      code: err.code || null,
      hint: err.hint || null,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  }
});

module.exports = router;
