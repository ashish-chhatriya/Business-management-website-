const router = require('express').Router();
const pool   = require('../db/pool');
const { auth, scopeDomain } = require('../middleware/auth');

// GET /api/dashboard/today
// Returns today's sales total, expenses, net profit, attendance summary, low stock count, pending salaries
router.get('/today', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const today = new Date().toISOString().split('T')[0];

    const [sales, expenses, attendance, lowStock, pendingSalaries] = await Promise.all([
      // Today's sales
      pool.query(
        `SELECT COALESCE(SUM(total_amount),0) AS total_sales,
                COUNT(*) AS total_orders
         FROM sales
         WHERE domain_id=$1 AND sale_date=$2 AND is_deleted=FALSE`,
        [domainId, today]
      ),
      // Today's expenses
      pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total_expenses
         FROM expenses
         WHERE domain_id=$1 AND expense_date=$2 AND is_deleted=FALSE`,
        [domainId, today]
      ),
      // Today's attendance counts
      pool.query(
        `SELECT
           COUNT(CASE WHEN status='present'  THEN 1 END) AS present,
           COUNT(CASE WHEN status='absent'   THEN 1 END) AS absent,
           COUNT(CASE WHEN status='half_day' THEN 1 END) AS half_day
         FROM attendance
         WHERE domain_id=$1 AND att_date=$2 AND is_deleted=FALSE`,
        [domainId, today]
      ),
      // Low stock count
      pool.query(
        `SELECT COUNT(*) AS low_stock_count
         FROM inventory
         WHERE domain_id=$1 AND current_stock <= minimum_stock`,
        [domainId]
      ),
      // Pending (unpaid) salary records
      pool.query(
        `SELECT COUNT(*) AS pending_salaries
         FROM salary_payments
         WHERE domain_id=$1 AND is_paid=FALSE AND is_deleted=FALSE`,
        [domainId]
      ),
    ]);

    const totalSales    = parseFloat(sales.rows[0].total_sales)    || 0;
    const totalExpenses = parseFloat(expenses.rows[0].total_expenses) || 0;

    res.json({
      total_sales:      totalSales,
      total_orders:     parseInt(sales.rows[0].total_orders)    || 0,
      total_expenses:   totalExpenses,
      net_profit:       totalSales - totalExpenses,
      present:          parseInt(attendance.rows[0].present)    || 0,
      absent:           parseInt(attendance.rows[0].absent)     || 0,
      half_day:         parseInt(attendance.rows[0].half_day)   || 0,
      low_stock_count:  parseInt(lowStock.rows[0].low_stock_count)      || 0,
      pending_salaries: parseInt(pendingSalaries.rows[0].pending_salaries) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/monthly-chart
// Returns daily sales & expenses for current month (for the line chart)
router.get('/monthly-chart', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

    const [salesRows, expenseRows] = await Promise.all([
      pool.query(
        `SELECT sale_date::text AS date, COALESCE(SUM(total_amount),0) AS sales
         FROM sales
         WHERE domain_id=$1 AND to_char(sale_date,'YYYY-MM')=$2 AND is_deleted=FALSE
         GROUP BY sale_date ORDER BY sale_date`,
        [domainId, month]
      ),
      pool.query(
        `SELECT expense_date::text AS date, COALESCE(SUM(amount),0) AS expenses
         FROM expenses
         WHERE domain_id=$1 AND to_char(expense_date,'YYYY-MM')=$2 AND is_deleted=FALSE
         GROUP BY expense_date ORDER BY expense_date`,
        [domainId, month]
      ),
    ]);

    res.json({ sales: salesRows.rows, expenses: expenseRows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/monthly-summary
// Returns aggregated totals for a given month (or current month)
router.get('/monthly-summary', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const [sales, expenses, payments] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(total_amount),0) AS total_sales, COUNT(*) AS total_orders
         FROM sales
         WHERE domain_id=$1 AND to_char(sale_date,'YYYY-MM')=$2 AND is_deleted=FALSE`,
        [domainId, month]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total_expenses
         FROM expenses
         WHERE domain_id=$1 AND to_char(expense_date,'YYYY-MM')=$2 AND is_deleted=FALSE`,
        [domainId, month]
      ),
      pool.query(
        `SELECT payment_mode,
                COALESCE(SUM(total_amount),0) AS amount,
                COUNT(*) AS orders
         FROM sales
         WHERE domain_id=$1 AND to_char(sale_date,'YYYY-MM')=$2 AND is_deleted=FALSE
         GROUP BY payment_mode`,
        [domainId, month]
      ),
    ]);

    const totalSales    = parseFloat(sales.rows[0].total_sales)    || 0;
    const totalExpenses = parseFloat(expenses.rows[0].total_expenses) || 0;

    res.json({
      month,
      total_sales:    totalSales,
      total_orders:   parseInt(sales.rows[0].total_orders) || 0,
      total_expenses: totalExpenses,
      net_profit:     totalSales - totalExpenses,
      payment_modes:  payments.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/top-items?period=month&date=YYYY-MM
// Returns top-selling items for the given period
router.get('/top-items', auth, scopeDomain, async (req, res) => {
  try {
    const domainId = req.domainId;
    const { period = 'month', date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];

    let dateFilter;
    if (period === 'day')        dateFilter = `sale_date = '${d}'`;
    else if (period === 'month') dateFilter = `to_char(sale_date,'YYYY-MM') = '${d.slice(0,7)}'`;
    else                         dateFilter = `EXTRACT(YEAR FROM sale_date) = ${d.slice(0,4)}`;

    const { rows } = await pool.query(
      `SELECT item_name,
              COUNT(*) AS orders,
              COALESCE(SUM(quantity),0) AS total_qty,
              COALESCE(SUM(total_amount),0) AS total_revenue
       FROM sales
       WHERE domain_id=$1 AND is_deleted=FALSE AND ${dateFilter}
       GROUP BY item_name
       ORDER BY total_revenue DESC
       LIMIT 10`,
      [domainId]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
