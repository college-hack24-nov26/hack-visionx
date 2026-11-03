// Notification centre API (FR-NT2): my notifications, unread count,
// mark read, dismiss. The bell/polling UI lives in the client.
const express = require('express');
const prisma = require('./prisma');
const { requireAuth, requireNotSuspended } = require('./auth');

const router = express.Router();
router.use(requireAuth, requireNotSuspended);

router.get('/', async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.notification.count({ where: { userId: req.user.id, read: false } }),
  ]);
  res.json({ notifications, unreadCount });
});

router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  const n = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!n) return res.status(404).json({ error: 'Notification not found' });
  const updated = await prisma.notification.update({ where: { id: n.id }, data: { read: true } });
  res.json({ notification: updated });
});

router.delete('/:id', async (req, res) => {
  const n = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!n) return res.status(404).json({ error: 'Notification not found' });
  await prisma.notification.delete({ where: { id: n.id } });
  res.json({ ok: true });
});

module.exports = router;
