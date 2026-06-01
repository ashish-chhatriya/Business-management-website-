const router = require('express').Router();
const pool   = require('../db/pool');
const { auth, scopeDomain } = require('../middleware/auth');

// ─── helpers ──────────────────────────────────────────────────────────────────

// Returns { fragment: string, value: any } for use as parameterised $2 in sales queries.
// Never interpolates user input directly; value is always passed as a pool param.
function salesPeriodParam(period, date) {
  if (period === 'day')  return { fragment: `sale_date = $2`,                            value: date };
  if (period === 'year') return { fragment: `EXTRACT(YEAR FROM sale_date) = $2`,         value: parseInt(date, 10) };
  /* month */            return { fragment: `to_char(sale_date,'YYYY-MM') = $2`,          value: date.slice(0, 7) };
}

function expPeriodParam(period, date) {
  if (period === 'day')  return { fragment: `expense_date = $2`,                         value: date };
  if (period === 'year') return { fragment: `EXTRACT(YEAR FROM expense_date) = $2`,      value: parseInt(date, 10) };
  /* month */            return { fragment: `to_char(expense_date,'YYYY-MM') = $2`,       value: date.slice(0, 7) };
}

function getEmployeeShopFilter(req, params) {
  if (req.user.role !== 'employee') return '';
  if (!req.user.shop_id) {
    throw new Error('Employee must be assigned to a shop');
  }
  params.push(req.user.shop_id);
  return ` AND shop_id = $${params.length}`;
}

// ─── GET /api/reports/sales/summary ──────────────────────────────────────────
// Used by Reports.jsx:  api.get('/reports/sales/summary', { params: { period, date } })
// Returns: { total_sales, total_orders, cash, upi, card, bank_transfer }
router.get('/sales/summary', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { period = 'month', date = new Date().toISOString().slice(0, 7) } = req.query;
    const { fragment, value } = salesPeriodParam(period, date);

    const params = [domainId, value];
    const shopFilter = getEmployeeShopFilter(req, params);
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(total_amount), 0)                                                 AS total_sales,
         COUNT(*)                                                                        AS total_orders,
         COALESCE(SUM(CASE WHEN payment_mode='Cash'          THEN total_amount END), 0) AS cash,
         COALESCE(SUM(CASE WHEN payment_mode='UPI'           THEN total_amount END), 0) AS upi,
         COALESCE(SUM(CASE WHEN payment_mode='Card'          THEN total_amount END), 0) AS card,
         COALESCE(SUM(CASE WHEN payment_mode='Bank Transfer' THEN total_amount END), 0) AS bank_transfer
       FROM sales
       WHERE domain_id=$1 AND is_deleted=FALSE AND ${fragment}${shopFilter}`,
      params
    );

    const r = rows[0];
    res.json({
      total_sales:   parseFloat(r.total_sales)   || 0,
      total_orders:  parseInt(r.total_orders)    || 0,
      cash:          parseFloat(r.cash)          || 0,
      upi:           parseFloat(r.upi)           || 0,
      card:          parseFloat(r.card)          || 0,
      bank_transfer: parseFloat(r.bank_transfer) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/reports/sales/chart ────────────────────────────────────────────
// Used by Reports.jsx:  api.get('/reports/sales/chart', { params: { period, date } })
// Returns: [{ label: string, value: number }]
router.get('/sales/chart', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { period = 'month', date = new Date().toISOString().slice(0, 7) } = req.query;

    let sql, params;

    if (period === 'day') {
      // Hourly buckets for a single date
      params = [domainId, date];
      const shopFilter = getEmployeeShopFilter(req, params);
      sql = `
        SELECT to_char(sale_time, 'HH12AM')  AS label,
               COALESCE(SUM(total_amount), 0) AS value
        FROM   sales
        WHERE  domain_id=$1 AND is_deleted=FALSE AND sale_date=$2${shopFilter}
        GROUP  BY label, EXTRACT(HOUR FROM sale_time)
        ORDER  BY EXTRACT(HOUR FROM sale_time)`;

    } else if (period === 'year') {
      params = [domainId, parseInt(date, 10)];
      const shopFilter = getEmployeeShopFilter(req, params);
      sql = `
        SELECT to_char(sale_date, 'Mon')      AS label,
               COALESCE(SUM(total_amount), 0) AS value
        FROM   sales
        WHERE  domain_id=$1 AND is_deleted=FALSE
          AND  EXTRACT(YEAR FROM sale_date) = $2${shopFilter}
        GROUP  BY EXTRACT(MONTH FROM sale_date), to_char(sale_date, 'Mon')
        ORDER  BY EXTRACT(MONTH FROM sale_date)`;

    } else {
      params = [domainId, date.slice(0, 7)];
      const shopFilter = getEmployeeShopFilter(req, params);
      sql = `
        SELECT to_char(sale_date, 'DD')       AS label,
               COALESCE(SUM(total_amount), 0) AS value
        FROM   sales
        WHERE  domain_id=$1 AND is_deleted=FALSE
          AND  to_char(sale_date, 'YYYY-MM') = $2${shopFilter}
        GROUP  BY sale_date ORDER BY sale_date`;
    }

    const { rows } = await pool.query(sql, params);
    res.json(rows.map(r => ({ label: r.label, value: parseFloat(r.value) || 0 })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/sales/by-shop?period=day|month|year|custom&date=&from=&to=&shop_id=
router.get('/sales/by-shop', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { period = 'month', date = new Date().toISOString().slice(0, 7), from, to, shop_id } = req.query;
    const conditions = ['s.domain_id=$1', 's.is_deleted=FALSE'];
    const params = [domainId];

    if (period === 'custom') {
      if (from) { params.push(from); conditions.push(`s.sale_date >= $${params.length}`); }
      if (to) { params.push(to); conditions.push(`s.sale_date <= $${params.length}`); }
    } else if (period === 'day') {
      params.push(date);
      conditions.push(`s.sale_date = $${params.length}`);
    } else if (period === 'year') {
      params.push(parseInt(date, 10));
      conditions.push(`EXTRACT(YEAR FROM s.sale_date) = $${params.length}`);
    } else {
      params.push(date.slice(0, 7));
      conditions.push(`to_char(s.sale_date,'YYYY-MM') = $${params.length}`);
    }

    if (shop_id) {
      params.push(shop_id);
      conditions.push(`s.shop_id = $${params.length}`);
    }
    const shopFilter = getEmployeeShopFilter(req, params);
    if (shopFilter) conditions.push(shopFilter.replace(' AND ', '')); // remove redundant AND prefix for conditions array

    const { rows } = await pool.query(
      `SELECT s.sale_date::text AS date,
              to_char(s.sale_time, 'HH24:MI') AS time,
              COALESCE(sh.name, d.name) AS shop,
              COALESCE(SUM(s.total_amount),0) AS total,
              s.payment_mode AS mode,
              COUNT(*) AS records
       FROM sales s
       LEFT JOIN shops sh ON s.shop_id=sh.id
       JOIN domains d ON s.domain_id=d.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY s.sale_date, to_char(s.sale_time, 'HH24:MI'), COALESCE(sh.name, d.name), s.payment_mode
       ORDER BY s.sale_date DESC, time DESC, shop`,
      params
    );

    res.json(rows.map(r => ({
      date: r.date,
      time: r.time,
      shop: r.shop,
      total: parseFloat(r.total) || 0,
      mode: r.mode,
      records: parseInt(r.records) || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/reports/expenses/summary ───────────────────────────────────────
// Used by Reports.jsx:  api.get('/expenses/summary', { params: { period, date } })
// Returns: [{ category: string, total: number }]
router.get('/expenses/summary', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { period = 'month', date = new Date().toISOString().slice(0, 7) } = req.query;
    const { fragment, value } = expPeriodParam(period, date);

    const { rows } = await pool.query(
      `SELECT category,
              COALESCE(SUM(amount), 0) AS total
       FROM   expenses
       WHERE  domain_id=$1 AND is_deleted=FALSE AND ${fragment}
       GROUP  BY category
       ORDER  BY total DESC`,
      [domainId, value]
    );

    res.json(rows.map(r => ({ category: r.category, total: parseFloat(r.total) || 0 })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/reports/attendance/summary ─────────────────────────────────────
// Used by Reports.jsx:  api.get('/attendance/summary', { params: { month } })
// Returns: [{ employee_id, name, present_days, half_days, absent_days }]
router.get('/attendance/summary', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const month = (req.query.month || new Date().toISOString().slice(0, 7)).slice(0, 7);

    const { rows } = await pool.query(
      `SELECT
         e.id   AS employee_id,
         e.name AS name,
         COUNT(CASE WHEN a.status = 'present'  THEN 1 END) AS present_days,
         COUNT(CASE WHEN a.status = 'half_day' THEN 1 END) AS half_days,
         COUNT(CASE WHEN a.status = 'absent'   THEN 1 END) AS absent_days
       FROM   employees e
       LEFT   JOIN attendance a
                ON a.employee_id = e.id
               AND a.domain_id   = e.domain_id
               AND to_char(a.att_date, 'YYYY-MM') = $2
               AND a.is_deleted  = FALSE
       WHERE  e.domain_id  = $1
         AND  e.status     = 'active'
         AND  e.is_deleted = FALSE
       GROUP  BY e.id, e.name
       ORDER  BY e.name`,
      [domainId, month]
    );

    res.json(
      rows.map(r => ({
        employee_id:  r.employee_id,
        name:         r.name,
        present_days: parseInt(r.present_days) || 0,
        half_days:    parseInt(r.half_days)    || 0,
        absent_days:  parseInt(r.absent_days)  || 0,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/reports/purchases ───────────────────────────────────────────────
// Used by Reports.jsx:  api.get('/purchases', { params: { from, to } })
// Returns: [{ ...purchase fields }]  — Reports.jsx sums r.price_paid
router.get('/purchases', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { from, to } = req.query;

    const conditions = ['domain_id=$1', 'is_deleted=FALSE'];
    const params     = [domainId];

    if (from) { params.push(from); conditions.push(`purchase_date >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`purchase_date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT id, purchase_code, purchase_date, ingredient_name, vendor_name,
              quantity, unit, price_paid, bill_number, notes
       FROM   purchases
       WHERE  ${conditions.join(' AND ')}
       ORDER  BY purchase_date DESC, created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
