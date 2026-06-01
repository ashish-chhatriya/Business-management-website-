const router = require('express').Router();
const pool = require('../db/pool');
const { auth, requireAdmin, scopeDomain } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/employees
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const { status, search } = req.query;
    let q = `SELECT * FROM employees WHERE domain_id=$1 AND is_deleted=FALSE`;
    const params = [req.domainId];
    if (status) { q += ` AND status=$${params.length+1}`; params.push(status); }
    if (search) { q += ` AND (name ILIKE $${params.length+1} OR emp_code ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    q += ' ORDER BY emp_code';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/:id
router.get('/:id', auth, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM employees WHERE id=$1 AND domain_id=$2 AND is_deleted=FALSE',
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees
router.post('/', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { name, phone, address, designation, monthly_salary, joining_date, fingerprint_id, emp_code } = req.body;
    if (!name || !monthly_salary) return res.status(400).json({ error: 'Name and salary required' });

    // Auto-generate emp_code if not provided
    let code = emp_code;
    if (!code) {
      const { rows: last } = await pool.query(
        `SELECT emp_code FROM employees WHERE domain_id=$1 ORDER BY created_at DESC LIMIT 1`, [req.domainId]
      );
      const n = last[0] ? parseInt(last[0].emp_code.replace(/\D/g,'')) + 1 : 1;
      code = `EMP-${String(n).padStart(3, '0')}`;
    }

    const { rows } = await pool.query(
      `INSERT INTO employees (id, domain_id, emp_code, name, phone, address, designation, monthly_salary, joining_date, fingerprint_id, created_by)
       VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.domainId, code, name, phone, address, designation, monthly_salary, joining_date || null, fingerprint_id || null, req.user.id]
    );
    await auditLog(req.domainId, req.user.id, req.user.name, 'Employee Added', 'Employees', rows[0].id, `Added: ${name}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Employee code already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employees/:id
router.put('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { name, phone, address, designation, monthly_salary, joining_date, fingerprint_id, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE employees SET name=$1, phone=$2, address=$3, designation=$4, monthly_salary=$5,
       joining_date=$6, fingerprint_id=$7, status=$8, updated_by=$9, updated_at=NOW()
       WHERE id=$10 AND domain_id=$11 AND is_deleted=FALSE RETURNING *`,
      [name, phone, address, designation, monthly_salary, joining_date, fingerprint_id, status || 'active', req.user.id, req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Employee Updated', 'Employees', rows[0].id, `Updated: ${name}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id (soft delete, admin only)
router.delete('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE employees SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 AND domain_id=$2 RETURNING name',
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Employee Deleted', 'Employees', req.params.id, `Soft deleted: ${rows[0].name}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
