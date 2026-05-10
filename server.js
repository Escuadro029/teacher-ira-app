require('dotenv').config();
const express      = require('express');
const path         = require('path');
const cookieParser = require('cookie-parser');
const pool         = require('./db/db');
const authRoutes   = require('./routes/auth_routes');
const { requireAdmin, requireStaff, verifyToken } = require('./middleware/auth_middleware');
const {
  sendOwnerNotification,
  sendBuyerConfirmation,
  sendFileDelivery,
} = require('./emailService');

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

/* ═══════════════════════════════════════
   PRODUCTS API
═══════════════════════════════════════ */

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

app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const { title, description, type, price, fileName, fileSize, pages, driveLink, isActive, isFeatured } = req.body;
    const result = await pool.query(
      `INSERT INTO products (title, description, type, price, file_name, file_size, pages, drive_link, is_active, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, description, type, price, fileName, fileSize, pages, driveLink, isActive ?? true, isFeatured ?? false]
    );
    console.log(`✅ Product added: ${result.rows[0].title}`);
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('❌ Insert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const { title, description, type, price, fileName, fileSize, pages, driveLink, isActive, isFeatured } = req.body;
    const result = await pool.query(
      `UPDATE products
       SET title=$1, description=$2, type=$3, price=$4,
           file_name=$5, file_size=$6, pages=$7, drive_link=$8,
           is_active=$9, is_featured=$10
       WHERE id=$11 RETURNING *`,
      [title, description, type, price, fileName, fileSize, pages, driveLink, isActive ?? true, isFeatured ?? false, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    console.log(`✅ Product updated: ${result.rows[0].title}`);
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('❌ Update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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

/* ═══════════════════════════════════════
   ORDERS API
   Schema: orders + order_items tables
═══════════════════════════════════════ */

/* ── Helper: attach items to order rows ── */
async function attachItems(orders) {
  if (!orders.length) return orders;
  const ids = orders.map(o => o.id);
  const items = await pool.query(
    `SELECT * FROM order_items WHERE order_id = ANY($1::text[])`,
    [ids]
  );
  const itemMap = {};
  items.rows.forEach(i => {
    if (!itemMap[i.order_id]) itemMap[i.order_id] = [];
    itemMap[i.order_id].push({
      id:       i.product_id,
      title:    i.title,
      price:    Number(i.price),
      fileName: i.file_name,
      fileSize: i.file_size,
      type:     i.type,
    });
  });
  return orders.map(o => ({ ...o, items: itemMap[o.id] || [] }));
}

/* ── Helper: map DB row → front-end shape ── */
function rowToOrder(r) {
  return {
    id:              r.id,
    email:           r.email,
    fullname:        r.fullname,
    address:         r.address,
    total:           Number(r.total),
    status:          r.status,
    delivered:       r.delivered,
    deliveredAt:     r.delivered_at,
    userId:          r.user_id,
    date:            r.date,
    // Reconstruct payment object for email/admin compatibility
    payment: r.payment_method === 'gcash-ref'
      ? { method: 'gcash-ref', ref: r.gcash_ref, amount: r.gcash_amount }
      : { method: 'gcash-screenshot', ssEmail: r.screenshot_email },
    items: r.items || [],
  };
}

// GET all orders (admin/staff only)
app.get('/api/orders', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders ORDER BY date DESC'
    );
    const orders = await attachItems(result.rows.map(rowToOrder));
    res.json(orders);
  } catch (err) {
    console.error('❌ Orders fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST — save new order + order_items (transaction) + send emails
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      email, fullname, address,
      items = [], total, payment = {},
    } = req.body;

    const orderId        = 'ORD-' + Date.now();
    const paymentMethod  = payment.method === 'gcash-ref' ? 'gcash-ref' : 'gcash-screenshot';
    const gcashRef       = payment.ref           || null;
    const gcashAmount    = payment.amount        ? Number(payment.amount) : null;
    const screenshotEmail = payment.ssEmail      || null;

    // Attach user if logged in (optional JWT)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt     = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        userId = decoded.id;
      } catch { /* guest checkout */ }
    }

    // 1. Insert order row
    await client.query(
      `INSERT INTO orders
         (id, email, fullname, address, total,
          status, delivered, payment_method,
          gcash_ref, gcash_amount, screenshot_email,
          date, user_id)
       VALUES ($1,$2,$3,$4,$5,'pending',FALSE,$6,$7,$8,$9,NOW(),$10)`,
      [orderId, email, fullname, address, total,
       paymentMethod, gcashRef, gcashAmount, screenshotEmail, userId]
    );

    // 2. Insert each order_item row
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, title, price, file_name, file_size, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, item.id, item.title, Number(item.price),
         item.fileName || null, item.fileSize || null, item.type || null]
      );
    }

    await client.query('COMMIT');
    console.log(`📦 New order: ${orderId} from ${email}`);

    // Build order object for emails
    const newOrder = {
      id: orderId, email, fullname, address, total,
      status: 'pending', delivered: false,
      date: new Date().toISOString(),
      payment: payment,
      items,
    };

    // Send emails — non-blocking
    Promise.allSettled([
      sendOwnerNotification(newOrder),
      sendBuyerConfirmation(newOrder),
    ]).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected')
          console.error(`⚠️  Email ${i === 0 ? 'owner' : 'buyer'} failed:`, r.reason?.message);
      });
    });

    res.json({ success: true, orderId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Order save error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET buyer's own orders
app.get('/api/orders/mine', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM orders
       WHERE user_id = $1 OR email = $2
       ORDER BY date DESC`,
      [req.user.id, req.user.email]
    );
    const orders = await attachItems(result.rows.map(rowToOrder));
    res.json(orders);
  } catch (err) {
    console.error('❌ Orders/mine error:', err.message);
    res.json([]);
  }
});

// POST — deliver order: mark paid + email files
app.post('/api/orders/:id/deliver', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE orders
       SET status = 'paid', delivered = TRUE, delivered_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

    const [order] = await attachItems([rowToOrder(result.rows[0])]);
    console.log(`✅ Order delivered: ${order.id}`);

    // Fetch products for drive links
    let products = [];
    try {
      const prods = await pool.query(
        'SELECT id, title, drive_link, file_size, pages FROM products'
      );
      products = prods.rows.map(p => ({
        id:        p.id,
        title:     p.title,
        driveLink: p.drive_link,
        fileSize:  p.file_size,
        pages:     p.pages,
      }));
    } catch (dbErr) {
      console.error('⚠️  Could not load products for delivery:', dbErr.message);
    }

    try {
      await sendFileDelivery(order, products);
    } catch (emailErr) {
      console.error('⚠️  Delivery email failed:', emailErr.message);
      return res.json({
        success: true,
        emailWarning: 'Order marked delivered but email failed: ' + emailErr.message,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Deliver error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST — resend file delivery email
app.post('/api/orders/:id/resend', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE id = $1', [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

    const [order] = await attachItems([rowToOrder(result.rows[0])]);

    let products = [];
    try {
      const prods = await pool.query(
        'SELECT id, title, drive_link, file_size, pages FROM products'
      );
      products = prods.rows.map(p => ({
        id:        p.id,
        title:     p.title,
        driveLink: p.drive_link,
        fileSize:  p.file_size,
        pages:     p.pages,
      }));
    } catch (dbErr) {
      console.error('⚠️  Could not load products for resend:', dbErr.message);
    }

    await sendFileDelivery(order, products);
    console.log(`🔄 Files resent: ${order.id}`);
    res.json({ success: true, message: 'Files resent to ' + order.email });
  } catch (err) {
    console.error('❌ Resend error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── START ── */
app.listen(PORT, () => {
  console.log(`\n🚀 Pressfiles running at http://localhost:${PORT}`);
  console.log(`📧 Email:  ${process.env.EMAIL_USER}`);
  console.log(`🐘 DB:     ${process.env.DATABASE_URL?.split('@')[1] || 'not set'}`);
  console.log(`🔐 Auth:   JWT + bcrypt\n`);
});