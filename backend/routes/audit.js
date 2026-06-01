const router = require('express').Router();
const pool = require('../db/pool');
const { auth, requireAdmin } = require('../middleware/auth');

// GET /api/audit/logs
router.get('/logs', auth, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];

    if (req.user.role !== 'superadmin') {
      values.push(req.user.domain_id);
      conditions.push(`domain_id = $${values.length}`);
    } else if (req.query.domain_id) {
      values.push(req.query.domain_id);
      conditions.push(`domain_id = $${values.length}`);
    }

    if (req.query.module) {
      values.push(req.query.module);
      conditions.push(`module = $${values.length}`);
    }

    if (req.query.search) {
      values.push(`%${req.query.search}%`);
      conditions.push(`(user_name ILIKE $${values.length} OR action ILIKE $${values.length} OR details ILIKE $${values.length})`);
    }

    if (req.query.from) {
      values.push(req.query.from);
      conditions.push(`created_at >= $${values.length}`);
    }

    if (req.query.to) {
      values.push(req.query.to);
      conditions.push(`created_at <= $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
      values
    );

    values.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT id, domain_id, user_id, user_name, action, module, record_id, details, ip_address, created_at
       FROM audit_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    res.json({ rows, total: Number(countResult.rows[0].total), page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
