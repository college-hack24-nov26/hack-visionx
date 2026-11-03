// Impact wall data (FR-I1): every figure is computed from real
// records in the database. Nothing here is typed in or estimated.
const express = require('express');
const prisma = require('./prisma');

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

module.exports = router;
