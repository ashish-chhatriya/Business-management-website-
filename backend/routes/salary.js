const router = require('express').Router();
const pool   = require('../db/pool');
const { auth, scopeDomain, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

function normalizeYearMonth(year, month) {
  const y = String(year || '').trim();
  const m = String(month || '').trim().padStart(2, '0');
  if (!/^[0-9]{4}$/.test(y) || !/^(0[1-9]|1[0-2])$/.test(m)) {
    return null;
  }
  return `${y}-${m}`;
}

async function verifyEmployee(domainId, employeeId) {
  const { rows } = await pool.query(
    'SELECT id FROM employees WHERE id=$1 AND domain_id=$2 AND is_deleted=FALSE',
    [employeeId, domainId]
  );
  return rows[0];
}

// GET /api/salary/matrix
// Returns a year grid of salary payment status for employees
router.get('/matrix', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const year = req.query.year || new Date().getFullYear().toString();
    const employeeId = req.query.employee_id;

    const params = [domainId, year];
    let employeeFilter = '';
    if (employeeId) {
      params.push(employeeId);
      employeeFilter = ` AND e.id=$${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT e.id AS employee_id, e.emp_code, e.name,
              sm.pay_month, sm.is_paid
       FROM employees e
       LEFT JOIN salary_matrix sm
         ON sm.employee_id=e.id AND sm.domain_id=$1 AND sm.pay_year=$2
       WHERE e.domain_id=$1 AND e.is_deleted=FALSE${employeeFilter}
       ORDER BY e.emp_code, e.name`,
      params
    );

    const result = [];
    const lookup = {};
    rows.forEach((row) => {
      if (!lookup[row.employee_id]) {
        lookup[row.employee_id] = {
          employee_id: row.employee_id,
          emp_code: row.emp_code,
          name: row.name,
          months: {},
        };
        result.push(lookup[row.employee_id]);
      }
      if (row.pay_month) {
        lookup[row.employee_id].months[row.pay_month] = row.is_paid === true;
      }
    });

    result.forEach((row) => {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        if (!(key in row.months)) {
          row.months[key] = false;
        }
      }
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/salary/matrix/:employee_id
router.get('/matrix/:employee_id', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const year = req.query.year || new Date().getFullYear().toString();
    const employeeId = req.params.employee_id;

    if (!await verifyEmployee(domainId, employeeId)) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { rows } = await pool.query(
      `SELECT pay_month, is_paid FROM salary_matrix
       WHERE domain_id=$1 AND employee_id=$2 AND pay_year=$3
       ORDER BY pay_month`,
      [domainId, employeeId, year]
    );

    const months = {};
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      months[key] = false;
    }
    rows.forEach((row) => {
      months[row.pay_month] = row.is_paid === true;
    });

    res.json({ employee_id: employeeId, year, months });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/salary/matrix/:employee_id/:year/:month/paid
router.put('/matrix/:employee_id/:year/:month/paid', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const domainId = req.domainId;
    const employeeId = req.params.employee_id;
    const payMonth = normalizeYearMonth(req.params.year, req.params.month);
    if (!payMonth) return res.status(400).json({ error: 'Invalid year or month' });

    if (!await verifyEmployee(domainId, employeeId)) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO salary_matrix
         (id, domain_id, employee_id, pay_year, pay_month, is_paid, paid_at, created_by, updated_by)
       VALUES
         (uuid_generate_v4(), $1, $2, $3, $4, TRUE, NOW(), $5, $5)
       ON CONFLICT (domain_id, employee_id, pay_month)
       DO UPDATE SET
         is_paid=TRUE,
         paid_at=NOW(),
         updated_by=$5,
         updated_at=NOW()
       RETURNING *`,
      [domainId, employeeId, req.params.year, payMonth, req.user.id]
    );

    await auditLog(domainId, req.user.id, req.user.name, 'Salary Matrix Paid', 'Salary', rows[0].id, `Marked paid for ${employeeId} ${payMonth}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/salary/matrix/:employee_id/:year/:month/unpaid
router.put('/matrix/:employee_id/:year/:month/unpaid', auth, scopeDomain, requireAdmin, async (req, res) => {
  try {
    const domainId = req.domainId;
    const employeeId = req.params.employee_id;
    const payMonth = normalizeYearMonth(req.params.year, req.params.month);
    if (!payMonth) return res.status(400).json({ error: 'Invalid year or month' });

    if (!await verifyEmployee(domainId, employeeId)) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO salary_matrix
         (id, domain_id, employee_id, pay_year, pay_month, is_paid, paid_at, created_by, updated_by)
       VALUES
         (uuid_generate_v4(), $1, $2, $3, $4, FALSE, NULL, $5, $5)
       ON CONFLICT (domain_id, employee_id, pay_month)
       DO UPDATE SET
         is_paid=FALSE,
         paid_at=NULL,
         updated_by=$5,
         updated_at=NOW()
       RETURNING *`,
      [domainId, employeeId, req.params.year, payMonth, req.user.id]
    );

    await auditLog(domainId, req.user.id, req.user.name, 'Salary Matrix Unpaid', 'Salary', rows[0].id, `Marked unpaid for ${employeeId} ${payMonth}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
