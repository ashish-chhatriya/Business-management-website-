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

// Accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD → returns YYYY-MM-DD or null
function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d.getTime()) ? s : null;
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return !isNaN(d.getTime()) ? iso : null;
  }
  return null;
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

// ─── NEW: GET /api/attendance/grid?year=YYYY ──────────────────────────────────
// Returns a grid: one row per employee, one column per month (Jan–Dec)
// Each cell: { present, half_day, absent } counts
router.get('/grid', auth, scopeDomain, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear().toString();

    const { rows } = await pool.query(`
      SELECT
        e.id as employee_id,
        e.emp_code,
        e.name as employee_name,
        e.designation,
        to_char(a.att_date, 'MM') as month_num,
        COUNT(CASE WHEN a.status='present'  THEN 1 END) as present,
        COUNT(CASE WHEN a.status='half_day' THEN 1 END) as half_day,
        COUNT(CASE WHEN a.status='absent'   THEN 1 END) as absent
      FROM employees e
      LEFT JOIN attendance a
        ON e.id = a.employee_id
        AND EXTRACT(YEAR FROM a.att_date) = $2
        AND a.is_deleted = FALSE
      WHERE e.domain_id=$1 AND e.is_deleted=FALSE AND e.status='active'
      GROUP BY e.id, e.emp_code, e.name, e.designation, to_char(a.att_date,'MM')
      ORDER BY e.emp_code, month_num
    `, [req.domainId, parseInt(year)]);

    // Reshape into { employee_id, emp_code, employee_name, designation, months: { '01': {...}, ... } }
    const empMap = {};
    rows.forEach(r => {
      if (!empMap[r.employee_id]) {
        empMap[r.employee_id] = {
          employee_id: r.employee_id,
          emp_code: r.emp_code,
          employee_name: r.employee_name,
          designation: r.designation,
          months: {}
        };
      }
      if (r.month_num) {
        empMap[r.employee_id].months[r.month_num] = {
          present:  parseInt(r.present)  || 0,
          half_day: parseInt(r.half_day) || 0,
          absent:   parseInt(r.absent)   || 0,
        };
      }
    });

    res.json(Object.values(empMap));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── NEW: GET /api/attendance/export-csv?year=YYYY ────────────────────────────
// Returns a CSV string: rows = employees, columns = months
router.get('/export-csv', auth, scopeDomain, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear().toString();

    const { rows } = await pool.query(`
      SELECT
        e.emp_code,
        e.name as employee_name,
        e.designation,
        to_char(a.att_date, 'MM') as month_num,
        COUNT(CASE WHEN a.status='present'  THEN 1 END) as present,
        COUNT(CASE WHEN a.status='half_day' THEN 1 END) as half_day,
        COUNT(CASE WHEN a.status='absent'   THEN 1 END) as absent
      FROM employees e
      LEFT JOIN attendance a
        ON e.id = a.employee_id
        AND EXTRACT(YEAR FROM a.att_date) = $2
        AND a.is_deleted = FALSE
      WHERE e.domain_id=$1 AND e.is_deleted=FALSE AND e.status='active'
      GROUP BY e.emp_code, e.name, e.designation, to_char(a.att_date,'MM')
      ORDER BY e.emp_code, month_num
    `, [req.domainId, parseInt(year)]);

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MONTH_NUMS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

    // Build employee map
    const empMap = {};
    rows.forEach(r => {
      if (!empMap[r.emp_code]) {
        empMap[r.emp_code] = { emp_code: r.emp_code, name: r.employee_name, designation: r.designation, months: {} };
      }
      if (r.month_num) {
        empMap[r.emp_code].months[r.month_num] = {
          present:  parseInt(r.present)  || 0,
          half_day: parseInt(r.half_day) || 0,
          absent:   parseInt(r.absent)   || 0,
        };
      }
    });

    // Build CSV
    const header = ['Emp Code', 'Name', 'Designation',
      ...MONTHS.flatMap(m => [`${m} Present`, `${m} Half Day`, `${m} Absent`])
    ];
    const csvRows = [header.join(',')];

    Object.values(empMap).forEach(emp => {
      const cols = [
        `"${emp.emp_code}"`,
        `"${emp.name}"`,
        `"${emp.designation || ''}"`,
        ...MONTH_NUMS.flatMap(mn => {
          const m = emp.months[mn] || { present: 0, half_day: 0, absent: 0 };
          return [m.present, m.half_day, m.absent];
        })
      ];
      csvRows.push(cols.join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${year}.csv"`);
    res.send(csvRows.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── NEW: POST /api/attendance/import-csv ─────────────────────────────────────
// Imports a CSV in the same format as export (employees x months grid)
// Columns: Emp Code, Name, Jan Present, Jan Half Day, Jan Absent, Feb Present ...
// The import creates/updates attendance records for each month/employee
router.post('/import-csv', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { year, rows: csvRows } = req.body;
    // csvRows: [{ emp_code, months: { '01': { present, half_day, absent }, ... } }]
    if (!year || !Array.isArray(csvRows)) {
      return res.status(400).json({ error: 'year and rows required' });
    }

    const failures = [];
    let imported = 0;

    for (const row of csvRows) {
      // Lookup employee by emp_code
      const { rows: empRows } = await pool.query(
        `SELECT id FROM employees WHERE domain_id=$1 AND emp_code=$2 AND is_deleted=FALSE`,
        [req.domainId, row.emp_code]
      );
      if (!empRows[0]) {
        failures.push({ emp_code: row.emp_code, error: 'Employee not found' });
        continue;
      }
      const employee_id = empRows[0].id;

      for (const [monthNum, counts] of Object.entries(row.months || {})) {
        const { present = 0, half_day = 0, absent = 0 } = counts;
        const totalDays = present + half_day + absent;
        if (totalDays === 0) continue;

        // We don't store per-day detail from the grid import — we upsert a summary
        // record for the 1st of each month as a placeholder with correct counts
        // A more advanced import would require per-day rows in the CSV
        const att_date = `${year}-${monthNum}-01`;
        // We insert individual day records only if the grid total > 0
        // For simplicity: insert present days from day 1, half days next, absent next
        let day = 1;
        const insertDay = async (status) => {
          const d = `${year}-${monthNum}-${String(day).padStart(2,'0')}`;
          day++;
          await pool.query(`
            INSERT INTO attendance (id, domain_id, employee_id, att_date, status, source, marked_by)
            VALUES (uuid_generate_v4(),$1,$2,$3,$4,'csv_import',$5)
            ON CONFLICT (domain_id, employee_id, att_date)
            DO UPDATE SET status=$4, source='csv_import', marked_by=$5, updated_at=NOW()
          `, [req.domainId, employee_id, d, status, req.user.id]);
          imported++;
        };

        for (let i = 0; i < present;  i++) await insertDay('present');
        for (let i = 0; i < half_day; i++) await insertDay('half_day');
        for (let i = 0; i < absent;   i++) await insertDay('absent');
      }
    }

    await auditLog(req.domainId, req.user.id, req.user.name,
      'Attendance CSV Imported', 'Attendance', null,
      `Year ${year}: ${imported} records imported, ${failures.length} employees failed`, req.ip);

    res.json({ imported, failures });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/manual
router.post('/manual', auth, scopeDomain, async (req, res) => {
  try {
    const { employee_id, att_date, status, check_in, check_out, half_day_reason } = req.body;
    if (!employee_id || !att_date || !status) {
      return res.status(400).json({ error: 'employee_id, att_date, status required' });
    }
    const cleanDate = normalizeDate(att_date);
    if (!cleanDate) return res.status(400).json({ error: 'Invalid date format' });

    const hours = calcHours(check_in, check_out);
    const { rows } = await pool.query(`
      INSERT INTO attendance (id, domain_id, employee_id, att_date, check_in, check_out, working_hours, status, source, half_day_reason, marked_by)
      VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,'manual',$8,$9)
      ON CONFLICT (domain_id, employee_id, att_date)
      DO UPDATE SET check_in=$4, check_out=$5, working_hours=$6, status=$7, source='manual',
                    half_day_reason=$8, marked_by=$9, updated_at=NOW()
      RETURNING *
    `, [req.domainId, employee_id, cleanDate, check_in || null, check_out || null, hours, status, half_day_reason || null, req.user.id]);

    const { rows: emp } = await pool.query('SELECT name FROM employees WHERE id=$1', [employee_id]);
    await auditLog(req.domainId, req.user.id, req.user.name, 'Attendance Marked', 'Attendance', rows[0].id,
      `${emp[0]?.name} — ${cleanDate}: ${status} (manual)`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/bulk
router.post('/bulk', auth, scopeDomain, async (req, res) => {
  try {
    const { att_date, records } = req.body;
    if (!att_date || !Array.isArray(records)) return res.status(400).json({ error: 'att_date and records array required' });

    const cleanDate = normalizeDate(att_date);
    if (!cleanDate) return res.status(400).json({ error: 'Invalid date format' });

    const results = [];
    for (const r of records) {
      const hours = calcHours(r.check_in, r.check_out);
      const { rows } = await pool.query(`
        INSERT INTO attendance (id, domain_id, employee_id, att_date, check_in, check_out, working_hours, status, source, marked_by)
        VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,'manual',$8)
        ON CONFLICT (domain_id, employee_id, att_date)
        DO UPDATE SET check_in=$4, check_out=$5, working_hours=$6, status=$7, source='manual', marked_by=$8, updated_at=NOW()
        RETURNING *
      `, [req.domainId, r.employee_id, cleanDate, r.check_in || null, r.check_out || null, hours, r.status || 'present', req.user.id]);
      results.push(rows[0]);
    }
    await auditLog(req.domainId, req.user.id, req.user.name, 'Bulk Attendance', 'Attendance', null,
      `Bulk marked ${records.length} employees for ${cleanDate}`, req.ip);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/biometric
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

    const { rows: existing } = await pool.query(
      'SELECT * FROM attendance WHERE domain_id=$1 AND employee_id=$2 AND att_date=$3',
      [emp.domain_id, emp.id, today]
    );

    if (!existing[0]) {
      await pool.query(`
        INSERT INTO attendance (id, domain_id, employee_id, att_date, check_in, status, source)
        VALUES (uuid_generate_v4(),$1,$2,$3,$4,'present','biometric')
      `, [emp.domain_id, emp.id, today, time]);
      res.json({ action: 'check_in', employee: emp.name, time });
    } else if (!existing[0].check_out) {
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
