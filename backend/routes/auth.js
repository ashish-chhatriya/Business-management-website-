const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { auth, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await pool.query(
      `SELECT u.*, d.name as domain_name, d.slug as domain_slug
       FROM users u JOIN domains d ON u.domain_id = d.id
       WHERE u.email = $1 AND u.is_active = TRUE`,
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user.id, domainId: user.domain_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    await auditLog(user.domain_id, user.id, user.name, 'Login', 'Auth', null, `Login from ${req.ip}`, req.ip);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        domain_id: user.domain_id,
        domain_name: user.domain_name,
        domain_slug: user.domain_slug,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.domain_id, d.name as domain_name, d.slug as domain_slug, u.last_login
     FROM users u JOIN domains d ON u.domain_id = d.id WHERE u.id=$1`,
    [req.user.id]
  );
  res.json(rows[0]);
});

// GET /api/auth/users  (admin only)
router.get('/users', auth, requireAdmin, async (req, res) => {
  const domainId = req.user.role === 'superadmin' ? req.query.domain_id : req.user.domain_id;
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.last_login, d.name as domain_name
     FROM users u JOIN domains d ON u.domain_id = d.id
     WHERE ($1::uuid IS NULL OR u.domain_id = $1) ORDER BY u.created_at`,
    [domainId || null]
  );
  res.json(rows);
});

// POST /api/auth/users (admin only)
router.post('/users', auth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, domain_id } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required' });

    // Managers can only be created within same domain
    const targetDomain = req.user.role === 'superadmin' ? domain_id : req.user.domain_id;
    if (!['admin', 'manager'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (id, domain_id, name, email, password_hash, role)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5) RETURNING id, name, email, role`,
      [targetDomain, name, email.toLowerCase(), hash, role]
    );
    await auditLog(targetDomain, req.user.id, req.user.name, 'User Created', 'Auth', rows[0].id, `Created ${role}: ${email}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/users/:id/toggle (admin)
router.put('/users/:id/toggle', auth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE users SET is_active = NOT is_active, updated_at=NOW() WHERE id=$1 AND domain_id=$2 RETURNING id, is_active',
    [req.params.id, req.user.domain_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// PUT /api/auth/users/:id/password (admin)
router.put('/users/:id/password', auth, requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
