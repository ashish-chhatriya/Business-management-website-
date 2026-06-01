const router = require('express').Router();
const pool = require('../db/pool');
const { auth, requireSuperAdmin, requireAdmin } = require('../middleware/auth');

// GET /api/domains — all domains (superadmin) or own domain (admin/manager)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role === 'superadmin') {
      const { rows } = await pool.query('SELECT * FROM domains ORDER BY name');
      return res.json(rows);
    }
    const { rows } = await pool.query('SELECT * FROM domains WHERE id=$1', [req.user.domain_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/domains — superadmin only
router.post('/', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, address, phone } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO domains (id, name, slug, address, phone) VALUES (uuid_generate_v4(),$1,$2,$3,$4) RETURNING *',
      [name, slug, address, phone]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Domain name or slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/domains/:id — superadmin or domain admin
router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const targetId = req.user.role === 'superadmin' ? req.params.id : req.user.domain_id;
    const { name, address, phone } = req.body;
    const { rows } = await pool.query(
      'UPDATE domains SET name=$1, address=$2, phone=$3 WHERE id=$4 RETURNING *',
      [name, address, phone, targetId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
