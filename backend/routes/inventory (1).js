const router = require('express').Router();
const pool   = require('../db/pool');
const { auth, scopeDomain } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/inventory
// Returns all inventory items; pass ?low_stock=true to filter only low-stock items
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const domainId  = req.domainId;
    const lowStock  = req.query.low_stock === 'true';

    const { rows } = await pool.query(
      `SELECT id, ingredient_name, current_stock, minimum_stock, unit, updated_at
       FROM inventory
       WHERE domain_id=$1
         ${lowStock ? 'AND current_stock <= minimum_stock' : ''}
       ORDER BY ingredient_name ASC`,
      [domainId]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/low-stock
// Dedicated low-stock alert endpoint; ordered by deficit severity
router.get('/low-stock', auth, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ingredient_name, current_stock, minimum_stock, unit, updated_at
       FROM inventory
       WHERE domain_id=$1 AND current_stock <= minimum_stock
       ORDER BY (minimum_stock - current_stock) DESC`,
      [req.domainId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id
router.get('/:id', auth, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ingredient_name, current_stock, minimum_stock, unit, updated_at
       FROM inventory
       WHERE id=$1 AND domain_id=$2`,
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory
router.post('/', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { ingredient_name, current_stock = 0, minimum_stock = 0, unit } = req.body;

    if (!ingredient_name) return res.status(400).json({ error: 'Ingredient name is required' });

    const { rows } = await pool.query(
      `INSERT INTO inventory (id, domain_id, ingredient_name, current_stock, minimum_stock, unit, updated_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW())
       RETURNING id, ingredient_name, current_stock, minimum_stock, unit, updated_at`,
      [domainId, ingredient_name.trim(), parseFloat(current_stock) || 0, parseFloat(minimum_stock) || 0, unit || null]
    );

    await auditLog(domainId, req.user.id, req.user.name, 'Inventory Created', 'Inventory', rows[0].id, `Added: ${ingredient_name}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ingredient already exists in inventory' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id
router.put('/:id', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { ingredient_name, current_stock, minimum_stock, unit } = req.body;

    const existing = await pool.query(
      `SELECT id FROM inventory WHERE id=$1 AND domain_id=$2`,
      [req.params.id, domainId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Item not found' });

    const { rows } = await pool.query(
      `UPDATE inventory
       SET ingredient_name = COALESCE($1, ingredient_name),
           current_stock   = COALESCE($2, current_stock),
           minimum_stock   = COALESCE($3, minimum_stock),
           unit            = COALESCE($4, unit),
           updated_at      = NOW()
       WHERE id=$5 AND domain_id=$6
       RETURNING id, ingredient_name, current_stock, minimum_stock, unit, updated_at`,
      [
        ingredient_name ? ingredient_name.trim() : null,
        current_stock  != null ? parseFloat(current_stock)  : null,
        minimum_stock  != null ? parseFloat(minimum_stock)  : null,
        unit           !== undefined ? unit : null,
        req.params.id,
        domainId,
      ]
    );

    await auditLog(domainId, req.user.id, req.user.name, 'Inventory Updated', 'Inventory', rows[0].id, `Updated: ${rows[0].ingredient_name}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ingredient name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;

    const { rows } = await pool.query(
      `DELETE FROM inventory WHERE id=$1 AND domain_id=$2 RETURNING id, ingredient_name`,
      [req.params.id, domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });

    await auditLog(domainId, req.user.id, req.user.name, 'Inventory Deleted', 'Inventory', rows[0].id, `Deleted: ${rows[0].ingredient_name}`, req.ip);
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
