require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
