const router = require('express').Router();
const pool   = require('../db/pool');
const { auth, scopeDomain } = require('../middleware/auth');

// GET /api/inventory
// Returns all inventory items for the domain, ordered by ingredient name
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { low_stock } = req.query;

    let query = `
      SELECT id, ingredient_name, current_stock, minimum_stock, unit, updated_at
      FROM inventory
      WHERE domain_id=$1
    `;
    const params = [domainId];

    if (low_stock === 'true') {
      query += ` AND current_stock <= minimum_stock`;
    }

    query += ` ORDER BY ingredient_name ASC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/low-stock
// Returns items where current_stock <= minimum_stock
router.get('/low-stock', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;

    const { rows } = await pool.query(
      `SELECT id, ingredient_name, current_stock, minimum_stock, unit, updated_at
       FROM inventory
       WHERE domain_id=$1 AND current_stock <= minimum_stock
       ORDER BY (minimum_stock - current_stock) DESC`,
      [domainId]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id
// Returns a single inventory item
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
// Creates a new inventory item
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

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ingredient already exists in inventory' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id
// Updates an inventory item (stock levels, minimum, unit)
router.put('/:id', auth, scopeDomain, async (req, res) => {
  try {
    const { ingredient_name, current_stock, minimum_stock, unit } = req.body;

    const existing = await pool.query(
      `SELECT id FROM inventory WHERE id=$1 AND domain_id=$2`,
      [req.params.id, req.domainId]
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
        unit !== undefined ? unit : null,
        req.params.id,
        req.domainId,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ingredient name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id
// Deletes an inventory item permanently
router.delete('/:id', auth, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM inventory WHERE id=$1 AND domain_id=$2 RETURNING id`,
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
