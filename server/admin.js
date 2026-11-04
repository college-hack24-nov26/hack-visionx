// Admin basics (Slice 6): user moderation (suspend/unsuspend) and
// listing moderation (remove/restore). Every route needs an ADMIN.
// P1 additions: NGO verification queue (verify/reject/unverify),
// the audit log viewer, and audit logging on every admin action.
const express = require('express');
const prisma = require('./prisma');
const { requireAuth } = require('./auth');
const { logAudit } = require('./audit');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.accountType !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
}

router.use(requireAuth, requireAdmin);

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, mobile: u.mobile,
    accountType: u.accountType, activeRole: u.activeRole, orgName: u.orgName,
    isSuspended: u.isSuspended, createdAt: u.createdAt,
  };
}

router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ users: users.map(publicUser) });
});

router.post('/users/:id/suspend', async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.accountType === 'ADMIN') {
    return res.status(400).json({ error: 'Admin accounts cannot be suspended' });
  }
  const updated = await prisma.user.update({ where: { id: target.id }, data: { isSuspended: true } });
  await logAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'USER_SUSPEND', targetType: 'USER', targetId: target.id, detail: target.email });
  res.json({ user: publicUser(updated) });
});

router.post('/users/:id/unsuspend', async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  const updated = await prisma.user.update({ where: { id: target.id }, data: { isSuspended: false } });
  await logAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'USER_UNSUSPEND', targetType: 'USER', targetId: target.id, detail: target.email });
  res.json({ user: publicUser(updated) });
});

router.get('/listings', async (req, res) => {
  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    include: { provider: { select: { id: true, name: true, email: true } } },
  });
  res.json({ listings });
});

router.post('/listings/:id/remove', async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status === 'REMOVED') return res.json({ listing });
  const updated = await prisma.listing.update({ where: { id: listing.id }, data: { status: 'REMOVED' } });
  await logAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'LISTING_REMOVE', targetType: 'LISTING', targetId: listing.id, detail: listing.foodName });
  res.json({ listing: updated });
});

router.post('/listings/:id/restore', async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'REMOVED') {
    return res.status(400).json({ error: 'Only removed listings can be restored' });
  }
  const restorable = listing.portionsRemaining > 0 && listing.deadline && listing.deadline > new Date();
  const status = !restorable
    ? 'EXPIRED'
    : listing.portionsRemaining < listing.portionCount ? 'PARTIALLY_CLAIMED' : 'LIVE';
  const updated = await prisma.listing.update({ where: { id: listing.id }, data: { status } });
  await logAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'LISTING_RESTORE', targetType: 'LISTING', targetId: listing.id, detail: listing.foodName });
  res.json({ listing: updated });
});

router.delete('/listings/:id', async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  // Claims and reviews on the listing cascade away with it (schema onDelete).
  await prisma.listing.delete({ where: { id: listing.id } });
  await logAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'LISTING_DELETE', targetType: 'LISTING', targetId: listing.id, detail: listing.foodName });
  res.json({ ok: true });
});

// NGO verification: review queue + decisions
router.get('/ngo-queue', async (req, res) => {
  const queue = await prisma.user.findMany({
    where: { accountType: 'NGO', ngoVerificationStatus: 'PENDING' },
    orderBy: { ngoSubmittedAt: 'asc' },
    select: {
      id: true, name: true, orgName: true, email: true,
      ngoDocFile: true, ngoDocName: true, ngoSubmittedAt: true,
    },
  });
  res.json({ queue });
});

async function ngoTarget(req, res) {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return null; }
  if (target.accountType !== 'NGO') { res.status(400).json({ error: 'Not an NGO account' }); return null; }
  return target;
}

router.post('/users/:id/verify-ngo', async (req, res) => {
  const target = await ngoTarget(req, res);
  if (!target) return;
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { ngoVerificationStatus: 'VERIFIED', ngoReviewNote: null },
  });
  await logAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'NGO_VERIFY', targetType: 'USER', targetId: target.id, detail: target.orgName || target.email });
  res.json({ user: publicUser(updated) });
});

router.post('/users/:id/reject-ngo', async (req, res) => {
  const target = await ngoTarget(req, res);
  if (!target) return;
  const note = typeof (req.body && req.body.note) === 'string' ? req.body.note : '';
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { ngoVerificationStatus: 'REJECTED', ngoReviewNote: note },
  });
  await logAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'NGO_REJECT', targetType: 'USER', targetId: target.id, detail: note || target.orgName || target.email });
  res.json({ user: publicUser(updated) });
});

router.post('/users/:id/unverify', async (req, res) => {
  const target = await ngoTarget(req, res);
  if (!target) return;
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { ngoVerificationStatus: 'NONE', ngoReviewNote: null },
  });
  await logAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'NGO_UNVERIFY', targetType: 'USER', targetId: target.id, detail: target.orgName || target.email });
  res.json({ user: publicUser(updated) });
});

// Audit log: latest 100 admin actions, newest first
router.get('/audit', async (req, res) => {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ entries });
});

module.exports = router;

