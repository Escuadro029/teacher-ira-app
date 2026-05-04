// middleware/auth.js
const jwt = require('jsonwebtoken');

/* ── VERIFY JWT TOKEN ── */
function verifyToken(req, res, next) {
  const token =
    req.cookies?.token ||
    req.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/* ── REQUIRE ADMIN ── */
function requireAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

/* ── REQUIRE ADMIN OR STAFF ── */
function requireStaff(req, res, next) {
  verifyToken(req, res, () => {
    if (!['admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    next();
  });
}

/* ── REQUIRE BUYER OR ABOVE ── */
function requireBuyer(req, res, next) {
  verifyToken(req, res, () => {
    if (!['admin', 'staff', 'buyer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Login required' });
    }
    next();
  });
}

/* ── OPTIONAL AUTH (don't block, just attach user if token exists) ── */
function optionalAuth(req, res, next) {
  const token =
    req.cookies?.token ||
    req.headers?.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

module.exports = { verifyToken, requireAdmin, requireStaff, requireBuyer, optionalAuth };