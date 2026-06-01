const pool = require('../db/pool');

const auditLog = async (domainId, userId, userName, action, module, recordId, details, ip) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (domain_id, user_id, user_name, action, module, record_id, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [domainId, userId, userName, action, module, recordId || null, details || null, ip || null]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { auditLog };
