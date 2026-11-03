// Reviews (P1): after a pickup is COLLECTED, the claimer and the donor can
// rate each other once per claim. Ratings are public on /users/:id.
const express = require('express');
const prisma = require('./prisma');
const { requireAuth } = require('./auth');

const router = express.Router();

// POST /api/reviews — body { claimId, stars, text? }
router.post('/', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const claimId = typeof body.claimId === 'string' ? body.claimId.trim() : '';
    const stars = body.stars;
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!claimId) return res.status(400).json({ error: 'claimId is required' });
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'Stars must be a whole number from 1 to 5' });
    }
    if (text.length > 500) {
      return res.status(400).json({ error: 'Review text is too long (max 500 characters)' });
    }

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: { listing: { select: { providerId: true } } },
    });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'COLLECTED') {
      return res.status(400).json({ error: 'You can review only after the pickup is completed' });
    }

    const me = req.user.id;
    let revieweeId = null;
    if (claim.claimerId === me) revieweeId = claim.listing.providerId;
    else if (claim.listing.providerId === me) revieweeId = claim.claimerId;
    else return res.status(403).json({ error: 'Only the claimer or the donor can review this claim' });

    const existing = await prisma.review.findFirst({ where: { claimId, reviewerId: me } });
    if (existing) return res.status(409).json({ error: 'You have already reviewed this pickup' });

    const review = await prisma.review.create({
      data: { claimId, reviewerId: me, revieweeId, stars, text: text || null },
    });
    return res.status(201).json({ review });
  } catch (err) {
    if (err && err.code === 'P2002') {
      return res.status(409).json({ error: 'You have already reviewed this pickup' });
    }
    console.error('POST /api/reviews failed:', err);
    return res.status(500).json({ error: 'Could not post the review' });
  }
});

// GET /api/reviews/mine — reviews the caller has GIVEN (frontend hides forms).
// Defined before /user/:id so "mine" is never read as a user id.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { reviewerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, claimId: true, revieweeId: true, stars: true, text: true, createdAt: true },
    });
    return res.json({ reviews });
  } catch (err) {
    console.error('GET /api/reviews/mine failed:', err);
    return res.status(500).json({ error: 'Could not load your reviews' });
  }
});

// GET /api/reviews/user/:userId — public: rating summary + reviews about a user.
router.get('/user/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, name: true, accountType: true, orgName: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const rows = await prisma.review.findMany({
      where: { revieweeId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { name: true } } },
    });
    const count = rows.length;
    const average = count === 0
      ? null
      : Math.round((rows.reduce((sum, r) => sum + r.stars, 0) / count) * 10) / 10;
    return res.json({
      user,
      average,
      count,
      reviews: rows.map((r) => ({
        stars: r.stars,
        text: r.text,
        createdAt: r.createdAt,
        reviewerName: r.reviewer ? r.reviewer.name : 'Someone',
      })),
    });
  } catch (err) {
    console.error('GET /api/reviews/user failed:', err);
    return res.status(500).json({ error: 'Could not load reviews' });
  }
});

module.exports = router;
