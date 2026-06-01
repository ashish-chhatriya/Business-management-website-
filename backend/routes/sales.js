const router = require('express').Router();
const { Readable } = require('stream');
const csv = require('csv-parser');
const multer = require('multer');
const pool = require('../db/pool');
const { auth, requireAdmin, scopeDomain } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const VALID_PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

const parseCsvBuffer = (buffer) => new Promise((resolve, reject) => {
  const rows = [];
  Readable.from(buffer)
    .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
    .on('data', (row) => rows.push(row))
    .on('error', reject)
    .on('end', () => resolve(rows));
});

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const normalizeTime = (value) => {
  const time = String(value || '').trim();
  if (!time) return new Date().toTimeString().slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(time)) return `${time}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(time)) return time;
  return null;
};

const getShopId = async (client, domainId, shopId, shopName) => {
  if (shopId) {
    const { rows } = await client.query(
      `SELECT id FROM shops WHERE id=$1 AND domain_id=$2 AND is_active=TRUE`,
      [shopId, domainId]
    );
    if (!rows[0]) throw new Error('Selected shop not found');
    return rows[0].id;
  }

  const name = String(shopName || '').trim();
  if (!name) throw new Error('Shop is required');

  const existing = await client.query(
    `SELECT id FROM shops WHERE domain_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`,
    [domainId, name]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO shops (id, domain_id, name)
     VALUES (uuid_generate_v4(), $1, $2)
     RETURNING id`,
    [domainId, name]
  );
  return inserted.rows[0].id;
};

const nextSaleNumber = async (client, domainId) => {
  const { rows } = await client.query(
    `SELECT sale_code FROM sales
     WHERE domain_id=$1
     ORDER BY CAST(REGEXP_REPLACE(sale_code, '[^0-9]', '', 'g') AS INTEGER) DESC NULLS LAST
     LIMIT 1`,
    [domainId]
  );
  return rows[0] ? parseInt(rows[0].sale_code.replace(/\D/g, ''), 10) + 1 : 1;
};

const enforceEmployeeShopScope = (req, res) => {
  if (req.user.role !== 'employee') return null;
  if (!req.user.shop_id) {
    res.status(403).json({ error: 'Employee must be assigned to a shop' });
    return false;
  }
  return req.user.shop_id;
};

const getEffectiveSaleShopId = async (client, req, shopId, shopName) => {
  if (req.user.role === 'employee') {
    if (shopId && shopId !== req.user.shop_id) {
      throw new Error('Employees can only use their own assigned shop');
    }
    return req.user.shop_id;
  }
  return getShopId(client, req.domainId, shopId, shopName);
};

// GET /api/sales?from=&to=&date=&mode=&shop_id=
router.get('/', auth, scopeDomain, async (req, res) => {
  try {
    const { from, to, date, mode, shop_id, page = 1, limit = 50 } = req.query;
    const employeeShopId = enforceEmployeeShopScope(req, res);
    if (employeeShopId === false) return;
    const offset = (page - 1) * limit;
    let q = `SELECT s.*, u.name as created_by_name, COALESCE(sh.name, d.name) as shop_name
             FROM sales s
             LEFT JOIN users u ON s.created_by = u.id
             LEFT JOIN shops sh ON s.shop_id = sh.id
             JOIN domains d ON s.domain_id = d.id
             WHERE s.domain_id=$1 AND s.is_deleted=FALSE`;
    const params = [req.domainId];
    if (date) { q += ` AND s.sale_date = $${params.length+1}`; params.push(date); }
    if (from) { q += ` AND s.sale_date >= $${params.length+1}`; params.push(from); }
    if (to) { q += ` AND s.sale_date <= $${params.length+1}`; params.push(to); }
    if (mode) { q += ` AND s.payment_mode = $${params.length+1}`; params.push(mode); }
    if (employeeShopId) {
      q += ` AND s.shop_id = $${params.length+1}`;
      params.push(employeeShopId);
    } else if (shop_id) {
      q += ` AND s.shop_id = $${params.length+1}`; params.push(shop_id);
    }
    q += ` ORDER BY s.sale_date DESC, s.sale_time DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/summary?period=day|month|year&date=&shop_id=
router.get('/summary', auth, scopeDomain, async (req, res) => {
  try {
    const { period = 'day', date } = req.query;
    const employeeShopId = enforceEmployeeShopScope(req, res);
    if (employeeShopId === false) return;
    const d = date || new Date().toISOString().split('T')[0];
    const params = [req.domainId];
    let dateFilter;
    if (period === 'day') {
      params.push(d);
      dateFilter = `sale_date = $${params.length}`;
    } else if (period === 'month') {
      params.push(d.slice(0, 7));
      dateFilter = `to_char(sale_date,'YYYY-MM') = $${params.length}`;
    } else {
      params.push(parseInt(d.slice(0, 4), 10));
      dateFilter = `EXTRACT(YEAR FROM sale_date) = $${params.length}`;
    }
    let shopFilter = '';
    if (employeeShopId) {
      params.push(employeeShopId);
      shopFilter = ` AND shop_id = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(total_amount),0) as total_sales,
        COUNT(*) as total_orders,
        COALESCE(AVG(total_amount),0) as avg_order,
        COALESCE(SUM(CASE WHEN payment_mode='Cash' THEN total_amount ELSE 0 END),0) as cash,
        COALESCE(SUM(CASE WHEN payment_mode='UPI' THEN total_amount ELSE 0 END),0) as upi,
        COALESCE(SUM(CASE WHEN payment_mode='Card' THEN total_amount ELSE 0 END),0) as card,
        COALESCE(SUM(CASE WHEN payment_mode='Bank Transfer' THEN total_amount ELSE 0 END),0) as bank_transfer
      FROM sales WHERE domain_id=$1 AND is_deleted=FALSE AND ${dateFilter}${shopFilter}
    `, params);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/chart?period=month&date=
router.get('/chart', auth, scopeDomain, async (req, res) => {
  try {
    const employeeShopId = enforceEmployeeShopScope(req, res);
    if (employeeShopId === false) return;
    const { period = 'month', date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    let q;
    const params = [req.domainId];
    const extraShop = employeeShopId ? { clause: ' AND shop_id = $3', value: employeeShopId } : null;

    if (period === 'month') {
      params.push(d.slice(0, 7));
      if (extraShop) params.push(extraShop.value);
      q = `SELECT sale_date::text as label, SUM(total_amount) as value, COUNT(*) as orders
           FROM sales WHERE domain_id=$1 AND is_deleted=FALSE AND to_char(sale_date,'YYYY-MM') = $2${extraShop ? ' AND shop_id = $3' : ''}
           GROUP BY sale_date ORDER BY sale_date`;
    } else if (period === 'year') {
      params.push(parseInt(d.slice(0, 4), 10));
      if (extraShop) params.push(extraShop.value);
      q = `SELECT to_char(sale_date,'Mon') as label, to_char(sale_date,'YYYY-MM') as key,
           SUM(total_amount) as value, COUNT(*) as orders
           FROM sales WHERE domain_id=$1 AND is_deleted=FALSE AND EXTRACT(YEAR FROM sale_date) = $2${extraShop ? ' AND shop_id = $3' : ''}
           GROUP BY to_char(sale_date,'Mon'), to_char(sale_date,'YYYY-MM') ORDER BY key`;
    } else {
      params.push(d);
      if (extraShop) params.push(extraShop.value);
      q = `SELECT to_char(sale_time,'HH12 AM') as label, SUM(total_amount) as value, COUNT(*) as orders
           FROM sales WHERE domain_id=$1 AND is_deleted=FALSE AND sale_date=$2${extraShop ? ' AND shop_id = $3' : ''}
           GROUP BY to_char(sale_time,'HH12 AM') ORDER BY MIN(sale_time)`;
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales/import
router.post('/import', auth, scopeDomain, upload.single('file'), async (req, res) => {
  if (req.user.role === 'employee') {
    return res.status(403).json({ error: 'CSV import not allowed for employee users' });
  }
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

    const parsedRows = await parseCsvBuffer(req.file.buffer);
    const failures = [];
    const validRows = [];

    parsedRows.forEach((row, index) => {
      const rowNumber = index + 2;
      const date = String(row.date || '').trim();
      const saleTime = normalizeTime(row.time);
      const shop = String(row.shop || '').trim();
      const total = Number(row.total);
      const mode = String(row.mode || '').trim();

      if (!isValidDate(date)) failures.push({ row: rowNumber, error: 'Invalid date. Use YYYY-MM-DD.' });
      else if (!saleTime) failures.push({ row: rowNumber, error: 'Invalid time. Use HH:mm.' });
      else if (!shop) failures.push({ row: rowNumber, error: 'Shop is required.' });
      else if (!Number.isFinite(total) || total <= 0) failures.push({ row: rowNumber, error: 'Total must be greater than 0.' });
      else if (!VALID_PAYMENT_MODES.includes(mode)) failures.push({ row: rowNumber, error: `Mode must be one of: ${VALID_PAYMENT_MODES.join(', ')}.` });
      else validRows.push({ date, saleTime, shop, total, mode });
    });

    await client.query('BEGIN');
    let nextNumber = await nextSaleNumber(client, req.domainId);
    const importedIds = [];

    for (const row of validRows) {
      const shopId = await getShopId(client, req.domainId, null, row.shop);
      const code = `SL-${String(nextNumber).padStart(4, '0')}`;
      nextNumber += 1;
      const inserted = await client.query(
        `INSERT INTO sales (id, domain_id, sale_code, sale_date, sale_time, shop_id, item_name, quantity, price_per_unit, payment_mode, notes, created_by)
         VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [req.domainId, code, row.date, row.saleTime, shopId, 'Shop Sale', 1, row.total, row.mode, `Imported for ${row.shop}`, req.user.id]
      );
      importedIds.push(inserted.rows[0].id);
    }

    await client.query('COMMIT');

    await auditLog(
      req.domainId,
      req.user.id,
      req.user.name,
      'Sales CSV Imported',
      'Sales',
      importedIds[0] || null,
      `CSV import completed. Total rows: ${parsedRows.length}, imported: ${validRows.length}, failed: ${failures.length}`,
      req.ip
    );

    res.status(201).json({
      total_rows: parsedRows.length,
      imported_rows: validRows.length,
      failed_rows: failures.length,
      failures,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/sales
router.post('/', auth, scopeDomain, async (req, res) => {
  const client = await pool.connect();
  try {
    const { shop_id, shop, total, payment_mode, notes, sale_date, sale_time } = req.body;
    if (!total || !payment_mode || (!shop_id && !shop)) {
      return res.status(400).json({ error: 'shop, total and payment_mode required' });
    }
    if (!VALID_PAYMENT_MODES.includes(payment_mode)) return res.status(400).json({ error: 'Invalid payment mode' });
    const saleTime = normalizeTime(sale_time);
    if (!saleTime) return res.status(400).json({ error: 'Invalid time. Use HH:mm.' });

    await client.query('BEGIN');
    const shopId = await getEffectiveSaleShopId(client, req, shop_id, shop);
    const code = `SL-${String(await nextSaleNumber(client, req.domainId)).padStart(4,'0')}`;
    const now = new Date();
    const amount = parseFloat(total);
    const { rows } = await client.query(
      `INSERT INTO sales (id, domain_id, sale_code, sale_date, sale_time, shop_id, item_name, quantity, price_per_unit, payment_mode, notes, created_by)
       VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.domainId, code, sale_date || now.toISOString().split('T')[0],
       saleTime, shopId, 'Shop Sale', 1, amount, payment_mode, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    await auditLog(req.domainId, req.user.id, req.user.name, 'Sale Added', 'Sales', rows[0].id,
      `${code}: ${payment_mode} ${amount}`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/sales/:id
router.put('/:id', auth, scopeDomain, async (req, res) => {
  const client = await pool.connect();
  try {
    const { shop_id, shop, total, payment_mode, notes, sale_date, sale_time } = req.body;
    if (!total || !payment_mode || (!shop_id && !shop)) return res.status(400).json({ error: 'shop, total and payment_mode required' });
    const saleTime = normalizeTime(sale_time);
    if (!saleTime) return res.status(400).json({ error: 'Invalid time. Use HH:mm.' });

    await client.query('BEGIN');
    const shopId = await getEffectiveSaleShopId(client, req, shop_id, shop);
    const { rows } = await client.query(
      `UPDATE sales SET shop_id=$1, price_per_unit=$2, payment_mode=$3, notes=$4,
       sale_date=$5, sale_time=$6, item_name='Shop Sale', quantity=1, updated_by=$7, updated_at=NOW()
       WHERE id=$8 AND domain_id=$9 AND is_deleted=FALSE RETURNING *`,
      [shopId, parseFloat(total), payment_mode, notes || null, sale_date, saleTime, req.user.id, req.params.id, req.domainId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found' });
    }
    await client.query('COMMIT');
    await auditLog(req.domainId, req.user.id, req.user.name, 'Sale Edited', 'Sales', rows[0].id, `Edited: ${rows[0].sale_code}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/sales/:id (admin only, soft)
router.delete('/:id', auth, requireAdmin, scopeDomain, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE sales SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 AND domain_id=$2 RETURNING sale_code',
      [req.params.id, req.domainId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Sale not found' });
    await auditLog(req.domainId, req.user.id, req.user.name, 'Sale Deleted', 'Sales', req.params.id, `Deleted: ${rows[0].sale_code}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
