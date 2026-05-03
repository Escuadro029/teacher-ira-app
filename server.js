const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Serve static files (CSS, JS, HTML)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Route to shop.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

// Products API endpoint
app.get('/api/products', (req, res) => {
  const data = fs.readFileSync(path.join(__dirname, 'assets/data/product.json'), 'utf8');
  res.json(JSON.parse(data));
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
