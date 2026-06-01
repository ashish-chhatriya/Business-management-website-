const router = require('express').Router();
const pool = require('../db/pool');
const { auth, requireAdmin, scopeDomain } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// Helper: calculate working hours
function calcHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  return Math.round(((oh * 60 + om) - (ih * 60 + im)) / 60 * 100) / 100;
}

// GET /api/attendance?date=&month=&employee_id=
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const { date, month, employee_id } = req.query;
    let q = `SELECT a.*, e.name as employee_name, e.emp_code, e.designation,
             u.name as marked_by_name
             FROM attendance a
             JOIN employees e ON a.employee_id = e.id
             LEFT JOIN users u ON a.marked_by = u.id
             WHERE a.domain_id=$1 AND a.is_deleted=FALSE`;
    const params = [req.domainId];
    if (date)        { q += ` AND a.att_date=$${params.length+1}`; params.push(date); }
    if (month)       { q += ` AND to_char(a.att_date,'YYYY-MM')=$${params.length+1}`; params.push(month); }
    if (employee_id) { q += ` AND a.employee_id=$${params.length+1}`; params.push(employee_id); }
    q += ' ORDER BY a.att_date DESC, e.emp_code';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/summary?month=YYYY-MM
router.get('/summary', auth, scopeDomain, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0,7);
    const { rows } = await pool.query(`
      SELECT e.id, e.name, e.emp_code, e.designation, e.monthly_salary,
        COUNT(CASE WHEN a.status='present' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status='half_day' THEN 1 END) as half_days,
        COUNT(CASE WHEN a.status='absent' THEN 1 END) as absent_days,
        ROUND(AVG(CASE WHEN a.working_hours > 0 THEN a.working_hours END)::numeric, 2) as avg_hours
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id
        AND to_char(a.att_date,'YYYY-MM')=$2 AND a.is_deleted=FALSE
      WHERE e.domain_id=$1 AND e.is_deleted=FALSE AND e.status='active'
      GROUP BY e.id, e.name, e.emp_code, e.designation, e.monthly_salary
      ORDER BY e.emp_code
    `, [req.domainId, month]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/manual — mark attendance manually
router.post('/manual', auth, scopeDomain, async (req, res) => {
  try {
    const { employee_id, att_date, status, check_in, check_out, half_day_reason } = req.body;
    if (!employee_id || !att_date || !status) {
      return res.status(400).json({ error: 'employee_id, att_date, status required' });
    }
    const hours = calcHours(check_in, check_out);
    const { rows } = await pool.query(`
      INSERT INTO attendance (id, domain_id, employee_id, att_date, check_in, check_out, working_hours, status, source, half_day_reason, marked_by)
      VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,'manual',$8,$9)
      ON CONFLICT (domain_id, employee_id, att_date)
      DO UPDATE SET check_in=$4, check_out=$5, working_hours=$6, status=$7, source='manual',
                    half_day_reason=$8, marked_by=$9, updated_at=NOW()
      RETURNING *
    `, [req.domainId, employee_id, att_date, check_in || null, check_out || null, hours, status, half_day_reason || null, req.user.id]);

    const { rows: emp } = await pool.query('SELECT name FROM employees WHERE id=$1', [employee_id]);
    await auditLog(req.domainId, req.user.id, req.user.name, 'Attendance Marked', 'Attendance', rows[0].id,
      `${emp[0]?.name} — ${att_date}: ${status} (manual)`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/bulk — mark multiple employees at once (admin/manager)
router.post('/bulk', auth, scopeDomain, async (req, res) => {
  try {
    const { att_date, records } = req.body; // records: [{employee_id, status, check_in, check_out}]
    if (!att_date || !Array.isArray(records)) return res.status(400).json({ error: 'att_date and records array required' });

    const results = [];
    for (const r of records) {
      const hours = calcHours(r.check_in, r.check_out);
      const { rows } = await pool.query(`
        INSERT INTO attendance (id, domain_id, employee_id, att_date, check_in, check_out, working_hours, status, source, marked_by)
        VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,'manual',$8)
        ON CONFLICT (domain_id, employee_id, att_date)
        DO UPDATE SET check_in=$4, check_out=$5, working_hours=$6, status=$7, source='manual', marked_by=$8, updated_at=NOW()
        RETURNING *
      `, [req.domainId, r.employee_id, att_date, r.check_in || null, r.check_out || null, hours, r.status || 'present', req.user.id]);
      results.push(rows[0]);
    }
    await auditLog(req.domainId, req.user.id, req.user.name, 'Bulk Attendance', 'Attendance', null,
      `Bulk marked ${records.length} employees for ${att_date}`, req.ip);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/biometric — webhook from ZKTeco/eSSL device
router.post('/biometric', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.BIOMETRIC_API_KEY) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    const { fingerprint_id, domain_slug, scan_time, scan_date } = req.body;
    if (!fingerprint_id || !domain_slug) return res.status(400).json({ error: 'fingerprint_id and domain_slug required' });

    const { rows: empRows } = await pool.query(
      `SELECT e.id, e.name, e.domain_id FROM employees e
       JOIN domains d ON e.domain_id = d.id
       WHERE d.slug=$1 AND e.fingerprint_id=$2 AND e.is_deleted=FALSE`,
      [domain_slug, fingerprint_id]
    );
    if (!empRows[0]) return res.status(404).json({ error: 'Employee not found for this fingerprint' });

    const emp = empRows[0];
    const today = scan_date || new Date().toISOString().split('T')[0];
    const time = scan_time || new Date().toTimeString().slice(0,8);

    // Check if already checked in today
    const { rows: existing } = await pool.query(
      'SELECT * FROM attendance WHERE domain_id=$1 AND employee_id=$2 AND att_date=$3',
      [emp.domain_id, emp.id, today]
    );

    if (!existing[0]) {
      // First scan = check in
      await pool.query(`
        INSERT INTO attendance (id, domain_id, employee_id, att_date, check_in, status, source)
        VALUES (uuid_generate_v4(),$1,$2,$3,$4,'present','biometric')
      `, [emp.domain_id, emp.id, today, time]);
      res.json({ action: 'check_in', employee: emp.name, time });
    } else if (!existing[0].check_out) {
      // Second scan = check out
      const hours = calcHours(existing[0].check_in, time);
      await pool.query(
        'UPDATE attendance SET check_out=$1, working_hours=$2, updated_at=NOW() WHERE id=$3',
        [time, hours, existing[0].id]
      );
      res.json({ action: 'check_out', employee: emp.name, time, hours });
    } else {
      res.json({ action: 'already_complete', employee: emp.name });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/attendance/:id/halfday
router.patch('/:id/halfday', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE attendance SET status='half_day', half_day_reason=$1, marked_by=$2, updated_at=NOW()
       WHERE id=$3 AND domain_id=$4 RETURNING *`,
      [reason || '', req.user.id, req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Record not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Half Day Marked', 'Attendance', rows[0].id,
      `Half day: ${reason}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
