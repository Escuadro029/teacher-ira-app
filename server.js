const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files (CSS, JS, HTML)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Route to shop.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
