const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT id, domain_id, shop_id, name, email, role, is_active FROM users WHERE id=$1',
      [decoded.userId]
    );
    if (!rows[0] || !rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or deactivated' });
    }
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

// Auto-scope all queries to user's domain (unless superadmin)
const scopeDomain = (req, res, next) => {
  req.domainId =
    req.query.domain_id ||
    req.body.domain_id ||
    req.user.domain_id;

  next();
};

module.exports = { auth, requireAdmin, requireSuperAdmin, scopeDomain };
