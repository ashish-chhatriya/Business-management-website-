const router = require('express').Router();
const pool = require('../db/pool');
const { auth, requireAdmin, scopeDomain } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/purchases
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const { from, to, ingredient, search } = req.query;
    let q = `SELECT p.*, u.name as created_by_name FROM purchases p
             LEFT JOIN users u ON p.created_by = u.id
             WHERE p.domain_id=$1 AND p.is_deleted=FALSE`;
    const params = [req.domainId];
    if (from)       { q += ` AND p.purchase_date >= $${params.length+1}`; params.push(from); }
    if (to)         { q += ` AND p.purchase_date <= $${params.length+1}`; params.push(to); }
    if (ingredient) { q += ` AND p.ingredient_name ILIKE $${params.length+1}`; params.push(`%${ingredient}%`); }
    if (search)     { q += ` AND (p.ingredient_name ILIKE $${params.length+1} OR p.vendor_name ILIKE $${params.length+1} OR p.purchase_code ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    q += ' ORDER BY p.purchase_date DESC, p.purchase_time DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/purchases
router.post('/', auth, scopeDomain, async (req, res) => {
  try {
    const { ingredient_name, vendor_name, quantity, unit, price_paid, bill_number, notes, purchase_date, purchase_time } = req.body;
    if (!ingredient_name || !quantity || !price_paid) {
      return res.status(400).json({ error: 'ingredient_name, quantity, price_paid required' });
    }
    const { rows: last } = await pool.query(
      `SELECT purchase_code FROM purchases WHERE domain_id=$1 ORDER BY created_at DESC LIMIT 1`, [req.domainId]
    );
    const n = last[0] ? parseInt(last[0].purchase_code.replace(/\D/g, '')) + 1 : 1;
    const code = `PO-${String(n).padStart(3, '0')}`;
    const now = new Date();

    const { rows } = await pool.query(
      `INSERT INTO purchases (id, domain_id, purchase_code, purchase_date, purchase_time, ingredient_name, vendor_name, quantity, unit, price_paid, bill_number, notes, created_by)
       VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.domainId, code,
       purchase_date || now.toISOString().split('T')[0],
       purchase_time || now.toTimeString().slice(0, 8),
       ingredient_name, vendor_name || null, quantity, unit || null,
       price_paid, bill_number || null, notes || null, req.user.id]
    );

    // Auto-update inventory
    await pool.query(`
      INSERT INTO inventory (id, domain_id, ingredient_name, current_stock, unit, updated_at)
      VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())
      ON CONFLICT (domain_id, ingredient_name)
      DO UPDATE SET current_stock = inventory.current_stock + $3, updated_at = NOW()
    `, [req.domainId, ingredient_name, quantity, unit || null]);

    await auditLog(req.domainId, req.user.id, req.user.name, 'Purchase Added', 'Purchases', rows[0].id,
      `${code}: ${ingredient_name} x${quantity} ₹${price_paid}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/purchases/:id
router.put('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { ingredient_name, vendor_name, quantity, unit, price_paid, bill_number, notes, purchase_date, purchase_time } = req.body;
    const { rows } = await pool.query(
      `UPDATE purchases SET ingredient_name=$1, vendor_name=$2, quantity=$3, unit=$4, price_paid=$5,
       bill_number=$6, notes=$7, purchase_date=$8, purchase_time=$9, updated_by=$10, updated_at=NOW()
       WHERE id=$11 AND domain_id=$12 AND is_deleted=FALSE RETURNING *`,
      [ingredient_name, vendor_name, quantity, unit, price_paid, bill_number, notes,
       purchase_date, purchase_time, req.user.id, req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Purchase not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Purchase Edited', 'Purchases', rows[0].id, `Edited: ${rows[0].purchase_code}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/purchases/:id (soft)
router.delete('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE purchases SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 AND domain_id=$2 RETURNING purchase_code',
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Purchase not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Purchase Deleted', 'Purchases', req.params.id, `Deleted: ${rows[0].purchase_code}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
