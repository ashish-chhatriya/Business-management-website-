const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { auth, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/settings/domain
router.get('/domain', auth, async (req, res) => {
  try {
    const domainId = req.user.role === 'superadmin' && req.query.domain_id ? req.query.domain_id : req.user.domain_id;
    const { rows } = await pool.query('SELECT * FROM domains WHERE id=$1', [domainId]);
    if (!rows[0]) return res.status(404).json({ error: 'Domain not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/domain
router.put('/domain', auth, requireAdmin, async (req, res) => {
  try {
    const targetId = req.user.role === 'superadmin' && req.body.domain_id ? req.body.domain_id : req.user.domain_id;
    const { name, address, phone } = req.body;
    const { rows } = await pool.query(
      'UPDATE domains SET name=$1, address=$2, phone=$3 WHERE id=$4 RETURNING *',
      [name, address, phone, targetId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Domain not found' });
    await auditLog(targetId, req.user.id, req.user.name, 'Settings Updated', 'Settings', targetId, 'Updated business info', req.ip);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Domain name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/change-password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'All fields required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const { rows } = await pool.query('SELECT id, password_hash, domain_id, name FROM users WHERE id=$1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    await auditLog(rows[0].domain_id, req.user.id, rows[0].name, 'Password Changed', 'Settings', req.user.id, 'User changed own password', req.ip);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
