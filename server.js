require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nri_institute_portal',
};

const pool = mysql.createPool(dbConfig);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
});

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many registration attempts. Please try again later.' },
});

async function initializeDatabase() {
  const bootstrap = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    multipleStatements: true,
  });

  try {
    await bootstrap.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
  } finally {
    await bootstrap.end();
  }

  const schemaSql = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
  const statements = schemaSql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    if (statement && !/^--/.test(statement)) {
      await pool.execute(statement);
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@nri.edu';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  const adminHash = await bcrypt.hash(adminPassword, 12);

  await pool.execute(
    `INSERT INTO users (email, password_hash, role, account_status, email_verified, created_at)
     VALUES (?, ?, 'ADMIN', 'ACTIVE', true, NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'ADMIN', account_status = 'ACTIVE', email_verified = true`,
    [adminEmail, adminHash]
  );

  const [adminRows] = await pool.execute('SELECT id FROM users WHERE email = ? AND role = "ADMIN"', [adminEmail]);
  if (adminRows.length > 0) {
    await pool.execute(
      `INSERT INTO admin_profiles (user_id, full_name, created_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
      [adminRows[0].id, 'System Administrator']
    );
  }
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access Denied.' });
    }
    next();
  };
}

async function sendVerificationEmail(email, token) {
  const verificationLink = `${process.env.APP_BASE_URL || 'http://localhost:5000'}/api/verify-email/${token}`;
  const smtpHost = process.env.SMTP_HOST;

  if (!smtpHost) {
    console.log(`Verification link for ${email}: ${verificationLink}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@nri.edu',
    to: email,
    subject: 'Verify Your NRI Student Account',
    text: `Please verify your account using this link: ${verificationLink}`,
  });
}

async function getStudentAuthorization(collegeEmail, rollNumber) {
  const [rows] = await pool.execute(
    'SELECT * FROM authorized_students WHERE LOWER(college_email) = LOWER(?) AND roll_number = ? AND registration_status = "APPROVED"',
    [collegeEmail, rollNumber]
  );

  return rows[0] || null;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'NRI auth service running.' });
});

app.post('/api/student/register', registrationLimiter, async (req, res) => {
  try {
    const {
      fullName,
      collegeEmail,
      studentId,
      department,
      yearOfStudy,
      section,
      phoneNumber,
      password,
      confirmPassword,
    } = req.body;

    if (!fullName || !collegeEmail || !studentId || !department || !yearOfStudy || !section || !phoneNumber || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Please enter valid student details.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Please enter valid student details.' });
    }

    const authorization = await getStudentAuthorization(collegeEmail, studentId);
    if (!authorization) {
      return res.status(403).json({ message: 'You are not authorized to register on this portal.' });
    }

    const [existingUser] = await pool.execute('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [collegeEmail]);
    if (existingUser.length > 0) {
      return res.status(409).json({ message: 'This student account is already registered.' });
    }

    const [existingStudent] = await pool.execute('SELECT id FROM student_profiles WHERE student_id = ?', [studentId]);
    if (existingStudent.length > 0) {
      return res.status(409).json({ message: 'This student account is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [insertUser] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, account_status, email_verified, created_at) VALUES (?, ?, "STUDENT", "PENDING_VERIFICATION", false, NOW())',
      [collegeEmail, passwordHash]
    );

    const userId = insertUser.insertId;
    await pool.execute(
      'INSERT INTO student_profiles (user_id, student_id, phone, department, year, section) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, studentId, phoneNumber, department, yearOfStudy, section]
    );

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.execute(
      'INSERT INTO email_verifications (user_id, verification_token_hash, expires_at, verified_at) VALUES (?, ?, ?, NULL)',
      [userId, verificationTokenHash, expiresAt]
    );

    await sendVerificationEmail(collegeEmail, verificationToken);

    return res.status(201).json({
      message: 'Registration successful. Please verify your college email.',
    });
  } catch (error) {
    console.error('Student register error:', error);
    return res.status(500).json({ message: 'Internal server error. Please try again.' });
  }
});

app.post('/api/student/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password.' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    const user = rows[0];

    if (!user || user.role !== 'STUDENT') {
      return res.status(401).json({ message: 'Invalid student credentials.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid student credentials.' });
    }

    if (!user.email_verified || user.account_status !== 'ACTIVE') {
      return res.status(403).json({ message: 'Please verify your college email before logging in.' });
    }

    const token = createToken(user);
    return res.status(200).json({
      message: 'Student login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Student login error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/api/admin/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Admin email and password are required.' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    const user = rows[0];

    if (!user || user.role !== 'ADMIN') {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }

    if (user.account_status !== 'ACTIVE') {
      return res.status(403).json({ message: 'Admin account is inactive. Contact the system administrator.' });
    }

    const token = createToken(user);
    return res.status(200).json({
      message: 'Admin login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/api/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const tokenHash = hashToken(token);

    const [rows] = await pool.execute(
      'SELECT * FROM email_verifications WHERE verification_token_hash = ? AND expires_at > NOW() AND verified_at IS NULL',
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({ message: 'Invalid or expired verification link.' });
    }

    const verification = rows[0];
    await pool.execute(
      'UPDATE users SET email_verified = true, account_status = "ACTIVE" WHERE id = ?',
      [verification.user_id]
    );
    await pool.execute(
      'UPDATE email_verifications SET verified_at = NOW() WHERE id = ?',
      [verification.id]
    );

    return res.status(200).json({
      message: 'Your email has been verified successfully. You can now log in.',
    });
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ message: 'Verification failed.' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  return res.status(200).json({ message: 'Logged out successfully.' });
});

app.get('/api/student/dashboard', requireAuth, requireRole(['STUDENT']), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.email, sp.student_id, sp.phone, sp.department, sp.year, sp.section
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );

    const profile = rows[0] || {};

    return res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
      profile,
      clubs: [
        { id: 1, name: 'Robotics Club' },
        { id: 2, name: 'Coding Club' },
      ],
      events: [
        { id: 1, type: 'Technical', title: 'AI Bootcamp' },
        { id: 2, type: 'Cultural', title: 'Cultural Fest' },
      ],
    });
  } catch (error) {
    console.error('Student dashboard error:', error);
    return res.status(500).json({ message: 'Could not load dashboard.' });
  }
});

app.get('/api/admin/dashboard', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const [students] = await pool.execute(
      'SELECT u.id, u.email, u.account_status, u.email_verified, sp.student_id, sp.department, sp.year, sp.section FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.role = "STUDENT" ORDER BY u.created_at DESC LIMIT 20'
    );

    const [pendingStudents] = await pool.execute(
      'SELECT COUNT(*) as total FROM users WHERE role = "STUDENT" AND account_status = "PENDING_VERIFICATION"'
    );

    return res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
      stats: {
        totalStudents: students.length,
        pendingVerification: pendingStudents[0].total,
      },
      students,
      announcements: [
        'Registration requests are open for authorized students only.',
        'Technical event submissions are due this week.',
      ],
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return res.status(500).json({ message: 'Could not load admin dashboard.' });
  }
});

app.get('/api/admin/authorized-students', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM authorized_students ORDER BY id DESC');
    return res.status(200).json({ students: rows });
  } catch (error) {
    console.error('Authorized students fetch error:', error);
    return res.status(500).json({ message: 'Could not load authorized students.' });
  }
});

app.post('/api/admin/authorized-students', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { studentName, collegeEmail, rollNumber, department, academicYear } = req.body;

    if (!studentName || !collegeEmail || !rollNumber || !department || !academicYear) {
      return res.status(400).json({ message: 'Please enter valid student details.' });
    }

    await pool.execute(
      `INSERT INTO authorized_students (student_name, college_email, roll_number, department, academic_year, registration_status)
       VALUES (?, ?, ?, ?, ?, 'APPROVED')
       ON DUPLICATE KEY UPDATE student_name = VALUES(student_name), department = VALUES(department), academic_year = VALUES(academic_year), registration_status = 'APPROVED'`,
      [studentName, collegeEmail, rollNumber, department, academicYear]
    );

    return res.status(201).json({ message: 'Student has been added to the authorized list.' });
  } catch (error) {
    console.error('Authorize student error:', error);
    return res.status(500).json({ message: 'Could not add authorized student.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/student/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/student/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/student/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`NRI auth app running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

startServer();
