console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const ensureShopSchema = require('./db/ensureShopSchema');

const app = express();

// ── Security ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

// ── CORS ──
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Body parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static uploads ──
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ──
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/domains',    require('./routes/domains'));
app.use('/api/employees',  require('./routes/employees'));
app.use('/api/sales',      require('./routes/sales'));
app.use('/api/shops',      require('./routes/shops'));
app.use('/api/expenses',   require('./routes/expenses'));
app.use('/api/purchases',  require('./routes/purchases'));
app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/salary',     require('./routes/salary'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/reports',    require('./routes/reports'));
app.use('/api/audit',      require('./routes/audit'));
app.use('/api/settings',   require('./routes/settings'));

// ── Health check ──
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── 404 ──
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

ensureShopSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Business Management System server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Database startup check failed:', err.message);
    process.exit(1);
  });

