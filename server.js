require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const pool    = require('./db/db');

const app  = express();
const PORT = 3000;

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── STATIC FILES ──
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ── ROUTES ──

// Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

// GET all active products
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

// POST — add new product
app.post('/api/products', async (req, res) => {
  try {
    const { title, description, type, price, fileName, fileSize, pages, driveLink, isActive } = req.body;
    const result = await pool.query(
      `INSERT INTO products (title, description, type, price, file_name, file_size, pages, drive_link, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, description, type, price, fileName, fileSize, pages, driveLink, isActive ?? true]
    );
    console.log(`✅ Product added: ${result.rows[0].title}`);
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('❌ Insert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT — update product
app.put('/api/products/:id', async (req, res) => {
  try {
    const { title, description, type, price, fileName, fileSize, pages, driveLink, isActive } = req.body;
    const result = await pool.query(
      `UPDATE products
       SET title=$1, description=$2, type=$3, price=$4,
           file_name=$5, file_size=$6, pages=$7, drive_link=$8, is_active=$9
       WHERE id=$10
       RETURNING *`,
      [title, description, type, price, fileName, fileSize, pages, driveLink, isActive ?? true, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Product not found' });
    }
    console.log(`✅ Product updated: ${result.rows[0].title}`);
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('❌ Update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE — remove product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING title',
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Product not found' });
    }
    console.log(`🗑️  Product deleted: ${result.rows[0].title}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET all orders
app.get('/api/orders', (req, res) => {
  try {
    const orders = JSON.parse(fs.readFileSync(
      path.join(__dirname, 'db', 'orders.json'), 'utf8'
    ));
    res.json(orders);
  } catch {
    res.json([]);
  }
});

// POST — deliver order (send files)
app.post('/api/orders/:id/deliver', async (req, res) => {
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

// POST — resend order files
app.post('/api/orders/:id/resend', async (req, res) => {
  try {
    console.log(`🔄 Resending order: ${req.params.id}`);
    res.json({ success: true, message: 'Files resent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📧 Email: ${process.env.EMAIL_USER}`);
  console.log(`🐘 DB: ${process.env.DATABASE_URL?.split('@')[1]}\n`);
});