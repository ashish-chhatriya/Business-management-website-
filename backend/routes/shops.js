const router = require('express').Router();
const pool = require('../db/pool');
const { auth, scopeDomain, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const { rows } = await pool.query(
      `SELECT id, name, address, is_active, created_at, updated_at
       FROM shops
       WHERE domain_id=$1 AND ($2::boolean=TRUE OR is_active=TRUE)
       ORDER BY name`,
      [req.domainId, includeInactive]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const { name, address } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Shop name is required' });

    const { rows } = await pool.query(
      `INSERT INTO shops (id, domain_id, name, address)
       VALUES (uuid_generate_v4(), $1, $2, $3)
       RETURNING id, name, address, is_active, created_at, updated_at`,
      [req.domainId, name.trim(), address || null]
    );

    await auditLog(req.domainId, req.user.id, req.user.name, 'Shop Added', 'Shops', rows[0].id, `Added shop: ${rows[0].name}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Shop already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const { name, address, is_active } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Shop name is required' });

    const { rows } = await pool.query(
      `UPDATE shops
       SET name=$1, address=$2, is_active=COALESCE($3, is_active), updated_at=NOW()
       WHERE id=$4 AND domain_id=$5
       RETURNING id, name, address, is_active, created_at, updated_at`,
      [name.trim(), address || null, is_active, req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Shop not found' });

    await auditLog(req.domainId, req.user.id, req.user.name, 'Shop Updated', 'Shops', rows[0].id, `Updated shop: ${rows[0].name}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Shop already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE shops SET is_active=FALSE, updated_at=NOW()
       WHERE id=$1 AND domain_id=$2
       RETURNING id, name`,
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Shop not found' });

    await auditLog(req.domainId, req.user.id, req.user.name, 'Shop Deleted', 'Shops', rows[0].id, `Deactivated shop: ${rows[0].name}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
