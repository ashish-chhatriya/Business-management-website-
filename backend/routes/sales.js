const router = require('express').Router();
const pool = require('../db/pool');
const { auth, requireAdmin, scopeDomain } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/sales?from=&to=&mode=&search=
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const { from, to, mode, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let q = `SELECT s.*, u.name as created_by_name FROM sales s
             LEFT JOIN users u ON s.created_by = u.id
             WHERE s.domain_id=$1 AND s.is_deleted=FALSE`;
    const params = [req.domainId];
    if (from)   { q += ` AND s.sale_date >= $${params.length+1}`; params.push(from); }
    if (to)     { q += ` AND s.sale_date <= $${params.length+1}`; params.push(to); }
    if (mode)   { q += ` AND s.payment_mode = $${params.length+1}`; params.push(mode); }
    if (search) { q += ` AND (s.item_name ILIKE $${params.length+1} OR s.sale_code ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    q += ` ORDER BY s.sale_date DESC, s.sale_time DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/summary?period=day|month|year&date=
router.get('/summary', auth, scopeDomain, async (req, res) => {
  try {
    const { period = 'day', date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    let dateFilter;
    if (period === 'day')   dateFilter = `sale_date = '${d}'`;
    else if (period === 'month') dateFilter = `to_char(sale_date,'YYYY-MM') = '${d.slice(0,7)}'`;
    else dateFilter = `EXTRACT(YEAR FROM sale_date) = ${d.slice(0,4)}`;

    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(total_amount),0) as total_sales,
        COUNT(*) as total_orders,
        COALESCE(AVG(total_amount),0) as avg_order,
        COALESCE(SUM(CASE WHEN payment_mode='Cash' THEN total_amount ELSE 0 END),0) as cash,
        COALESCE(SUM(CASE WHEN payment_mode='UPI' THEN total_amount ELSE 0 END),0) as upi,
        COALESCE(SUM(CASE WHEN payment_mode='Card' THEN total_amount ELSE 0 END),0) as card,
        COALESCE(SUM(CASE WHEN payment_mode='Bank Transfer' THEN total_amount ELSE 0 END),0) as bank_transfer
      FROM sales WHERE domain_id=$1 AND is_deleted=FALSE AND ${dateFilter}
    `, [req.domainId]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/chart?period=month&date=
router.get('/chart', auth, scopeDomain, async (req, res) => {
  try {
    const { period = 'month', date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    let q;
    if (period === 'month') {
      q = `SELECT sale_date::text as label, SUM(total_amount) as value, COUNT(*) as orders
           FROM sales WHERE domain_id=$1 AND is_deleted=FALSE
           AND to_char(sale_date,'YYYY-MM') = '${d.slice(0,7)}'
           GROUP BY sale_date ORDER BY sale_date`;
    } else if (period === 'year') {
      q = `SELECT to_char(sale_date,'Mon') as label, to_char(sale_date,'YYYY-MM') as key,
           SUM(total_amount) as value, COUNT(*) as orders
           FROM sales WHERE domain_id=$1 AND is_deleted=FALSE
           AND EXTRACT(YEAR FROM sale_date) = ${d.slice(0,4)}
           GROUP BY to_char(sale_date,'Mon'), to_char(sale_date,'YYYY-MM') ORDER BY key`;
    } else {
      q = `SELECT to_char(sale_time,'HH12 AM') as label, SUM(total_amount) as value, COUNT(*) as orders
           FROM sales WHERE domain_id=$1 AND is_deleted=FALSE AND sale_date='${d}'
           GROUP BY to_char(sale_time,'HH12 AM') ORDER BY MIN(sale_time)`;
    }
    const { rows } = await pool.query(q, [req.domainId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales
router.post('/', auth, scopeDomain, async (req, res) => {
  try {
    const { item_name, quantity, price_per_unit, payment_mode, notes, sale_date, sale_time } = req.body;
    if (!item_name || !quantity || !price_per_unit || !payment_mode) {
      return res.status(400).json({ error: 'item_name, quantity, price_per_unit, payment_mode required' });
    }
    const { rows: last } = await pool.query(
      `SELECT sale_code FROM sales WHERE domain_id=$1 ORDER BY created_at DESC LIMIT 1`, [req.domainId]
    );
    const n = last[0] ? parseInt(last[0].sale_code.replace(/\D/g,'')) + 1 : 1;
    const code = `SL-${String(n).padStart(4,'0')}`;
    const now = new Date();
    const { rows } = await pool.query(
      `INSERT INTO sales (id, domain_id, sale_code, sale_date, sale_time, item_name, quantity, price_per_unit, payment_mode, notes, created_by)
       VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.domainId, code, sale_date || now.toISOString().split('T')[0],
       sale_time || now.toTimeString().slice(0,8), item_name, quantity, price_per_unit, payment_mode, notes || null, req.user.id]
    );
    await auditLog(req.domainId, req.user.id, req.user.name, 'Sale Added', 'Sales', rows[0].id,
      `${code}: ${item_name} x${quantity} ₹${quantity*price_per_unit}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sales/:id
router.put('/:id', auth, scopeDomain, async (req, res) => {
  try {
    const { item_name, quantity, price_per_unit, payment_mode, notes, sale_date, sale_time } = req.body;
    const { rows } = await pool.query(
      `UPDATE sales SET item_name=$1, quantity=$2, price_per_unit=$3, payment_mode=$4, notes=$5,
       sale_date=$6, sale_time=$7, updated_by=$8, updated_at=NOW()
       WHERE id=$9 AND domain_id=$10 AND is_deleted=FALSE RETURNING *`,
      [item_name, quantity, price_per_unit, payment_mode, notes, sale_date, sale_time, req.user.id, req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Sale not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Sale Edited', 'Sales', rows[0].id, `Edited: ${rows[0].sale_code}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sales/:id (admin only, soft)
router.delete('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE sales SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 AND domain_id=$2 RETURNING sale_code',
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Sale not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Sale Deleted', 'Sales', req.params.id, `Deleted: ${rows[0].sale_code}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
