require('dotenv').config();
const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const cookieParser = require('cookie-parser');
const pool         = require('./db/db');
const authRoutes   = require('./routes/auth_routes');
const { requireAdmin, requireStaff, verifyToken } = require('./middleware/auth_middleware');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── MIDDLEWARE ── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ── STATIC FILES ── */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

/* ── AUTH ROUTES ── */
app.use('/api/auth', authRoutes);

/* ── HOME ── */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

/* ── PRODUCTS API ── */

// GET all active products (public)
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, type, price,
              file_name, file_size, pages, drive_link,
              is_active, is_featured, downloads_count
       FROM products
       WHERE is_active = TRUE
       ORDER BY id ASC`
    );
    const products = result.rows.map(p => ({
      id:          p.id,
      title:       p.title,
      description: p.description,
      type:        p.type,
      price:       Number(p.price),
      fileName:    p.file_name,
      fileSize:    p.file_size,
      pages:       p.pages,
      driveLink:   p.drive_link,
      isActive:    p.is_active,
      isFeatured:  p.is_featured,
    }));
    res.json(products);
  } catch (err) {
    console.error('❌ Products DB error:', err.message);
    res.status(500).json({ error: 'Could not load products' });
  }
});

// POST — add new product (admin only)
app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const { title, description, type, price, fileName, fileSize, pages, driveLink, isActive, isFeatured } = req.body;
    const result = await pool.query(
      `INSERT INTO products (title, description, type, price, file_name, file_size, pages, drive_link, is_active, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, description, type, price, fileName, fileSize, pages, driveLink, isActive??true, isFeatured??false]
    );
    console.log(`✅ Product added: ${result.rows[0].title}`);
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('❌ Insert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT — update product (admin only)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const { title, description, type, price, fileName, fileSize, pages, driveLink, isActive, isFeatured } = req.body;
    const result = await pool.query(
      `UPDATE products
       SET title=$1, description=$2, type=$3, price=$4,
           file_name=$5, file_size=$6, pages=$7, drive_link=$8,
           is_active=$9, is_featured=$10
       WHERE id=$11 RETURNING *`,
      [title, description, type, price, fileName, fileSize, pages, driveLink, isActive??true, isFeatured??false, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    console.log(`✅ Product updated: ${result.rows[0].title}`);
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('❌ Update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE — remove product (admin only)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING title',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    console.log(`🗑️  Product deleted: ${result.rows[0].title}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── ORDERS API ── */

// GET all orders (admin/staff only)
app.get('/api/orders', requireStaff, async (req, res) => {
  try {
    const ordersPath = path.join(__dirname, 'db', 'orders.json');
    if (!fs.existsSync(ordersPath)) return res.json([]);
    const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    res.json(orders);
  } catch {
    res.json([]);
  }
});

// POST — save new order (requires login)
app.post('/api/orders', verifyToken, async (req, res) => {
  try {
    const ordersPath = path.join(__dirname, 'db', 'orders.json');
    const orders     = fs.existsSync(ordersPath)
      ? JSON.parse(fs.readFileSync(ordersPath, 'utf8'))
      : [];
    const newOrder = {
      ...req.body,
      userId:    req.user.id,
      userEmail: req.user.email,
      id:        'ORD-' + Date.now(),
      date:      new Date().toISOString(),
      status:    'pending',
      delivered: false,
    };
    orders.push(newOrder);
    fs.mkdirSync(path.dirname(ordersPath), { recursive: true });
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
    console.log(`📦 New order: ${newOrder.id} from ${newOrder.userEmail}`);
    res.json({ success: true, orderId: newOrder.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET buyer's own orders
app.get('/api/orders/mine', verifyToken, async (req, res) => {
  try {
    const ordersPath = path.join(__dirname, 'db', 'orders.json');
    if (!fs.existsSync(ordersPath)) return res.json([]);
    const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    const mine   = orders.filter(o => o.userId === req.user.id || o.email === req.user.email);
    res.json(mine);
  } catch {
    res.json([]);
  }
});

// POST — deliver order (admin/staff only)
app.post('/api/orders/:id/deliver', requireStaff, async (req, res) => {
  try {
    const ordersPath = path.join(__dirname, 'db', 'orders.json');
    const orders     = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    const index      = orders.findIndex(o => o.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Order not found' });
    orders[index].status      = 'paid';
    orders[index].delivered   = true;
    orders[index].deliveredAt = new Date().toISOString();
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
    console.log(`✅ Order delivered: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — resend order (admin/staff only)
app.post('/api/orders/:id/resend', requireStaff, async (req, res) => {
  try {
    console.log(`🔄 Resending: ${req.params.id}`);
    res.json({ success: true, message: 'Files resent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── START ── */
app.listen(PORT, () => {
  console.log(`\n🚀 Pressfiles running at http://localhost:${PORT}`);
  console.log(`📧 Email:  ${process.env.EMAIL_USER}`);
  console.log(`🐘 DB:     ${process.env.DATABASE_URL?.split('@')[1]}`);
  console.log(`🔐 Auth:   JWT + bcrypt\n`);
});