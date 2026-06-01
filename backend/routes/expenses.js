const router = require('express').Router();
const pool = require('../db/pool');
const { auth, requireAdmin, scopeDomain } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/expenses
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
    if (search)   { q += ` AND (e.notes ILIKE $${params.length+1} OR e.expense_code ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    q += ' ORDER BY e.expense_date DESC, e.expense_time DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/expenses/summary
router.get('/summary', auth, scopeDomain, async (req, res) => {
  try {
    const { period = 'month', date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    let dateFilter;
    if (period === 'day')   dateFilter = `expense_date = '${d}'`;
    else if (period === 'month') dateFilter = `to_char(expense_date,'YYYY-MM') = '${d.slice(0,7)}'`;
    else dateFilter = `EXTRACT(YEAR FROM expense_date) = ${d.slice(0,4)}`;

    const { rows } = await pool.query(`
      SELECT category, SUM(amount) as total
      FROM expenses WHERE domain_id=$1 AND is_deleted=FALSE AND ${dateFilter}
      GROUP BY category ORDER BY total DESC
    `, [req.domainId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses
router.post('/', auth, scopeDomain, async (req, res) => {
  try {
    const { category, amount, expense_date, expense_time, notes } = req.body;
    if (!category || !amount) return res.status(400).json({ error: 'category and amount required' });
    const { rows: last } = await pool.query(
      `SELECT expense_code FROM expenses WHERE domain_id=$1 ORDER BY created_at DESC LIMIT 1`, [req.domainId]
    );
    const n = last[0] ? parseInt(last[0].expense_code.replace(/\D/g,'')) + 1 : 1;
    const code = `EXP-${String(n).padStart(3,'0')}`;
    const now = new Date();
    const { rows } = await pool.query(
      `INSERT INTO expenses (id, domain_id, expense_code, category, amount, expense_date, expense_time, notes, created_by)
       VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.domainId, code, category, amount,
       expense_date || now.toISOString().split('T')[0],
       expense_time || now.toTimeString().slice(0,8), notes || null, req.user.id]
    );
    await auditLog(req.domainId, req.user.id, req.user.name, 'Expense Added', 'Expenses', rows[0].id,
      `${code}: ${category} ₹${amount}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id (admin only)
router.put('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { category, amount, expense_date, expense_time, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE expenses SET category=$1, amount=$2, expense_date=$3, expense_time=$4, notes=$5,
       updated_by=$6, updated_at=NOW()
       WHERE id=$7 AND domain_id=$8 AND is_deleted=FALSE RETURNING *`,
      [category, amount, expense_date, expense_time, notes, req.user.id, req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Expense Edited', 'Expenses', rows[0].id, `Edited: ${rows[0].expense_code}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id (admin only, soft)
router.delete('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE expenses SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 AND domain_id=$2 RETURNING expense_code',
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Expense Deleted', 'Expenses', req.params.id, `Deleted: ${rows[0].expense_code}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
