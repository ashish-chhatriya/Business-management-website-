const router = require('express').Router();
const pool   = require('../db/pool');
const { auth, scopeDomain, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/salary
// Returns salary payment records for a given month (defaults to current month)
// ?month=YYYY-MM  ?employee_id=uuid  ?is_paid=true|false
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const month    = req.query.month || new Date().toISOString().slice(0, 7);

    const filters  = ['sp.domain_id=$1', 'sp.pay_month=$2', 'sp.is_deleted=FALSE'];
    const params   = [domainId, month];

    if (req.query.employee_id) {
      params.push(req.query.employee_id);
      filters.push(`sp.employee_id=$${params.length}`);
    }
    if (req.query.is_paid !== undefined) {
      params.push(req.query.is_paid === 'true');
      filters.push(`sp.is_paid=$${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT sp.*,
              e.name   AS employee_name,
              e.emp_code,
              e.designation
       FROM salary_payments sp
       JOIN employees e ON sp.employee_id = e.id
       WHERE ${filters.join(' AND ')}
       ORDER BY e.name ASC`,
      params
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/salary/summary
// Returns month-level totals: total payable, total paid, total pending
router.get('/summary', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const month    = req.query.month || new Date().toISOString().slice(0, 7);

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                                          AS total_records,
         COALESCE(SUM(final_amount), 0)                                   AS total_payable,
         COALESCE(SUM(CASE WHEN is_paid=TRUE  THEN final_amount END), 0)  AS total_paid,
         COALESCE(SUM(CASE WHEN is_paid=FALSE THEN final_amount END), 0)  AS total_pending,
         COUNT(CASE WHEN is_paid=TRUE  THEN 1 END)                        AS paid_count,
         COUNT(CASE WHEN is_paid=FALSE THEN 1 END)                        AS pending_count
       FROM salary_payments
       WHERE domain_id=$1 AND pay_month=$2 AND is_deleted=FALSE`,
      [domainId, month]
    );

    res.json({ month, ...rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/salary/:id
router.get('/:id', auth, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sp.*,
              e.name AS employee_name,
              e.emp_code,
              e.designation,
              e.monthly_salary AS base_monthly_salary
       FROM salary_payments sp
       JOIN employees e ON sp.employee_id = e.id
       WHERE sp.id=$1 AND sp.domain_id=$2 AND sp.is_deleted=FALSE`,
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Salary record not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/salary
// Generate a salary record for an employee for a given month
router.post('/', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const domainId = req.domainId;
    const {
      employee_id, pay_month, base_salary,
      present_days = 0, half_days = 0, absent_days = 0,
      bonus = 0, advance_deduction = 0, other_deductions = 0,
      final_amount, payment_method, notes,
    } = req.body;

    if (!employee_id || !pay_month || !base_salary || final_amount == null) {
      return res.status(400).json({ error: 'employee_id, pay_month, base_salary and final_amount are required' });
    }

    // Confirm employee belongs to domain
    const emp = await pool.query(
      `SELECT id, name FROM employees WHERE id=$1 AND domain_id=$2 AND is_deleted=FALSE`,
      [employee_id, domainId]
    );
    if (!emp.rows[0]) return res.status(404).json({ error: 'Employee not found' });

    const { rows } = await pool.query(
      `INSERT INTO salary_payments
         (id, domain_id, employee_id, pay_month, base_salary,
          present_days, half_days, absent_days,
          bonus, advance_deduction, other_deductions,
          final_amount, payment_method, notes, is_paid, created_by)
       VALUES
         (uuid_generate_v4(), $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13, FALSE, $14)
       RETURNING *`,
      [
        domainId, employee_id, pay_month, parseFloat(base_salary),
        parseInt(present_days), parseInt(half_days), parseInt(absent_days),
        parseFloat(bonus), parseFloat(advance_deduction), parseFloat(other_deductions),
        parseFloat(final_amount), payment_method || null, notes || null,
        req.user.id,
      ]
    );

    await auditLog(domainId, req.user.id, req.user.name, 'Salary Created', 'Salary', rows[0].id, `Salary for ${emp.rows[0].name} — ${pay_month}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Salary record already exists for this employee and month' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/salary/:id
// Update an unpaid salary record (amounts, notes, method)
router.put('/:id', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const domainId = req.domainId;

    const existing = await pool.query(
      `SELECT id, is_paid FROM salary_payments WHERE id=$1 AND domain_id=$2 AND is_deleted=FALSE`,
      [req.params.id, domainId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Salary record not found' });
    if (existing.rows[0].is_paid) return res.status(400).json({ error: 'Cannot edit a paid salary record' });

    const {
      base_salary, present_days, half_days, absent_days,
      bonus, advance_deduction, other_deductions,
      final_amount, payment_method, notes,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE salary_payments
       SET base_salary        = COALESCE($1, base_salary),
           present_days       = COALESCE($2, present_days),
           half_days          = COALESCE($3, half_days),
           absent_days        = COALESCE($4, absent_days),
           bonus              = COALESCE($5, bonus),
           advance_deduction  = COALESCE($6, advance_deduction),
           other_deductions   = COALESCE($7, other_deductions),
           final_amount       = COALESCE($8, final_amount),
           payment_method     = COALESCE($9, payment_method),
           notes              = COALESCE($10, notes),
           updated_by         = $11,
           updated_at         = NOW()
       WHERE id=$12 AND domain_id=$13
       RETURNING *`,
      [
        base_salary       != null ? parseFloat(base_salary)       : null,
        present_days      != null ? parseInt(present_days)        : null,
        half_days         != null ? parseInt(half_days)           : null,
        absent_days       != null ? parseInt(absent_days)         : null,
        bonus             != null ? parseFloat(bonus)             : null,
        advance_deduction != null ? parseFloat(advance_deduction) : null,
        other_deductions  != null ? parseFloat(other_deductions)  : null,
        final_amount      != null ? parseFloat(final_amount)      : null,
        payment_method    || null,
        notes             || null,
        req.user.id,
        req.params.id, domainId,
      ]
    );

    await auditLog(domainId, req.user.id, req.user.name, 'Salary Updated', 'Salary', rows[0].id, `Updated salary record ${req.params.id}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/salary/:id/mark-paid
// Mark a salary record as paid and stamp paid_at
router.put('/:id/mark-paid', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const domainId = req.domainId;

    const { rows } = await pool.query(
      `UPDATE salary_payments
       SET is_paid    = TRUE,
           paid_at    = NOW(),
           updated_by = $1,
           updated_at = NOW()
       WHERE id=$2 AND domain_id=$3 AND is_deleted=FALSE AND is_paid=FALSE
       RETURNING *`,
      [req.user.id, req.params.id, domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Record not found or already marked paid' });

    await auditLog(domainId, req.user.id, req.user.name, 'Salary Paid', 'Salary', rows[0].id, `Marked paid: ${rows[0].pay_month}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/salary/:id  (soft delete, unpaid only)
router.delete('/:id', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const domainId = req.domainId;

    const existing = await pool.query(
      `SELECT id, is_paid FROM salary_payments WHERE id=$1 AND domain_id=$2 AND is_deleted=FALSE`,
      [req.params.id, domainId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Salary record not found' });
    if (existing.rows[0].is_paid) return res.status(400).json({ error: 'Cannot delete a paid salary record' });

    await pool.query(
      `UPDATE salary_payments SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );

    await auditLog(domainId, req.user.id, req.user.name, 'Salary Deleted', 'Salary', req.params.id, `Deleted salary record ${req.params.id}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
