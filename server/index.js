require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./prisma');
const authRoutes = require('./auth');
const path = require('path');


const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      ok: true,
      service: 'Food Waste Saver API',
      database: 'connected',
      users: userCount,
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ ok: false, database: 'unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/listings/recognize', require('./recognize'));
app.use('/api/listings', require('./listings'));
app.use('/api/browse', require('./browse'));
app.use('/api/claims', require('./claims'));
app.use('/api/notifications', require('./notifications'));
require('./jobs').startJobs();
app.use('/api/admin', require('./admin'));
app.use('/api/impact', require('./impact'));





app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
