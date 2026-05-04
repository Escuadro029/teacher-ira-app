// routes/auth.js
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/db');
const { verifyToken } = require('../middleware/auth_middleware');

const router = express.Router();
const SALT_ROUNDS   = 12;
const TOKEN_EXPIRES = '7d';

/* ── HELPERS ── */
function generateToken(user) {
  return jwt.sign(
    {
      id:       user.id,
      email:    user.email,
      role:     user.role,
      fullName: user.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES }
  );
}

function setCookieToken(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function sanitizeUser(user) {
  return {
    id:          user.id,
    fullName:    user.full_name,
    email:       user.email,
    role:        user.role,
    isActive:    user.is_active,
    isVerified:  user.is_verified,
    phone:       user.phone,
    address:     user.address,
    totalOrders: user.total_orders,
    totalSpent:  Number(user.total_spent),
    createdAt:   user.created_at,
    lastLogin:   user.last_login,
  };
}

/* ─────────────────────────────────────────
   POST /api/auth/register
   Body: { fullName, email, password, phone?, inviteCode? }
   inviteCode required for admin/staff
───────────────────────────────────────── */
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, phone, inviteCode } = req.body;

    // ── Validation ──
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, email and password are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // ── Check existing email ──
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1', [email.toLowerCase()]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // ── Determine role ──
    let role = 'buyer';
    if (inviteCode) {
      if (inviteCode === process.env.ADMIN_INVITE_CODE) {
        role = 'admin';
      } else {
        return res.status(400).json({ error: 'Invalid invite code.' });
      }
    }

    // ── Hash password ──
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // ── Insert user ──
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, phone, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [fullName, email.toLowerCase(), passwordHash, role, phone||null, role==='admin']
    );

    const user  = result.rows[0];
    const token = generateToken(user);
    setCookieToken(res, token);

    console.log(`✅ New ${role} registered: ${email}`);
    res.status(201).json({
      success: true,
      token,
      user: sanitizeUser(user),
    });

  } catch (err) {
    console.error('❌ Register error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/* ─────────────────────────────────────────
   POST /api/auth/login
   Body: { email, password }
───────────────────────────────────────── */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // ── Find user ──
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1', [email.toLowerCase()]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const user = result.rows[0];

    // ── Check active ──
    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact support.' });
    }

    // ── Verify password ──
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    // ── Update last login ──
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]
    );

    const token = generateToken(user);
    setCookieToken(res, token);

    console.log(`✅ Login: ${email} (${user.role})`);
    res.json({
      success: true,
      token,
      user: sanitizeUser(user),
    });

  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/* ─────────────────────────────────────────
   POST /api/auth/logout
───────────────────────────────────────── */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

/* ─────────────────────────────────────────
   GET /api/auth/me
   Returns current logged in user
───────────────────────────────────────── */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = TRUE',
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ success: true, user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch user.' });
  }
});

/* ─────────────────────────────────────────
   PUT /api/auth/profile
   Update name, phone, address
───────────────────────────────────────── */
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { fullName, phone, address } = req.body;
    const result = await pool.query(
      `UPDATE users SET full_name=$1, phone=$2, address=$3
       WHERE id=$4 RETURNING *`,
      [fullName, phone||null, address||null, req.user.id]
    );
    res.json({ success: true, user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Could not update profile.' });
  }
});

/* ─────────────────────────────────────────
   PUT /api/auth/change-password
   Body: { currentPassword, newPassword }
───────────────────────────────────────── */
router.put('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user   = result.rows[0];
    const match  = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, req.user.id]);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not change password.' });
  }
});

/* ─────────────────────────────────────────
   ADMIN: GET /api/auth/users
   List all users
───────────────────────────────────────── */
router.get('/users', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only.' });
    }
    const result = await pool.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows.map(sanitizeUser));
  } catch (err) {
    res.status(500).json({ error: 'Could not load users.' });
  }
});

/* ─────────────────────────────────────────
   ADMIN: PUT /api/auth/users/:id/role
   Change user role
───────────────────────────────────────── */
router.put('/users/:id/role', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only.' });
    }
    const { role } = req.body;
    if (!['admin','staff','buyer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    const result = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING *',
      [role, req.params.id]
    );
    res.json({ success: true, user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Could not update role.' });
  }
});

/* ─────────────────────────────────────────
   ADMIN: PUT /api/auth/users/:id/toggle
   Activate / deactivate user
───────────────────────────────────────── */
router.put('/users/:id/toggle', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only.' });
    }
    const result = await pool.query(
      'UPDATE users SET is_active = NOT is_active WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    res.json({ success: true, user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Could not toggle user.' });
  }
});

module.exports = router;