// Impact wall data (FR-I1): every figure is computed from real
// records in the database. Nothing here is typed in or estimated.
// FR-I2 adds /me: the signed-in user's own impact, same rule.
const express = require('express');
const prisma = require('./prisma');
const { requireAuth } = require('./auth');

const router = express.Router();
const LIVE_FAMILY = ['LIVE', 'PARTIALLY_CLAIMED', 'FULLY_CLAIMED'];

router.get('/', async (req, res) => {
  const now = new Date();
  const [agg, listingsShared, liveNow, donors, claimers] = await Promise.all([
    prisma.claim.aggregate({
      where: { status: 'COLLECTED' },
      _sum: { portions: true },
      _count: { _all: true },
    }),
    prisma.listing.count({ where: { status: { not: 'DRAFT' } } }),
    prisma.listing.count({ where: { status: { in: LIVE_FAMILY }, deadline: { gt: now } } }),
    prisma.listing.findMany({
      where: { status: { not: 'DRAFT' } },
      select: { providerId: true },
      distinct: ['providerId'],
    }),
    prisma.claim.findMany({
      where: { status: 'COLLECTED' },
      select: { claimerId: true },
      distinct: ['claimerId'],
    }),
  ]);
  res.json({
    impact: {
      portionsRescued: agg._sum.portions || 0,
      pickupsCompleted: agg._count._all,
      listingsShared,
      donors: donors.length,
      peopleHelped: claimers.length,
      liveNow,
    },
  });
});

// Personal impact for the signed-in user, from their real records only.
router.get('/me', requireAuth, async (req, res) => {
  const me = req.user.id;
  const [given, taken, listingsPosted, takenRows] = await Promise.all([
    prisma.claim.aggregate({
      where: { status: 'COLLECTED', listing: { providerId: me } },
      _sum: { portions: true },
      _count: { _all: true },
    }),
    prisma.claim.aggregate({
      where: { status: 'COLLECTED', claimerId: me },
      _sum: { portions: true },
      _count: { _all: true },
    }),
    prisma.listing.count({ where: { providerId: me, status: { not: 'DRAFT' } } }),
    prisma.claim.findMany({
      where: { status: 'COLLECTED', claimerId: me },
      select: { listing: { select: { providerId: true } } },
    }),
  ]);
  const donorsMet = new Set(
    takenRows.map((c) => c.listing && c.listing.providerId).filter(Boolean)
  ).size;
  res.json({
    donor: {
      portionsShared: given._sum.portions || 0,
      pickupsGiven: given._count._all,
      listingsPosted,
    },
    claimer: {
      portionsCollected: taken._sum.portions || 0,
      pickupsCompleted: taken._count._all,
      donorsMet,
    },
  });
});

module.exports = router;
