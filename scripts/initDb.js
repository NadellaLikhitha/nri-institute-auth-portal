const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function initDatabase() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nri_institute_portal',
  };

  const rootConnection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });

  try {
    await rootConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${config.database}\`;`);
  } finally {
    await rootConnection.end();
  }

  const connection = await mysql.createConnection(config);
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      if (statement && !/^--/.test(statement)) {
        await connection.execute(statement);
      }
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@nri.edu';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const adminHash = await bcrypt.hash(adminPassword, 12);

    await connection.execute(
      `INSERT INTO users (email, password_hash, role, account_status, email_verified, created_at)
       VALUES (?, ?, 'ADMIN', 'ACTIVE', true, NOW())
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'ADMIN', account_status = 'ACTIVE', email_verified = true`,
      [adminEmail, adminHash]
    );

    const [adminRows] = await connection.execute('SELECT id FROM users WHERE email = ? AND role = "ADMIN"', [adminEmail]);
    if (adminRows.length > 0) {
      await connection.execute(
        `INSERT INTO admin_profiles (user_id, full_name, created_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
        [adminRows[0].id, 'System Administrator']
      );
    }

    console.log('Database initialized successfully.');
    console.log(`Admin email: ${adminEmail}`);
    console.log(`Admin password: ${adminPassword}`);
  } finally {
    await connection.end();
  }
}

initDatabase().catch((error) => {
  console.error('Initialization error:', error);
  process.exit(1);
});
