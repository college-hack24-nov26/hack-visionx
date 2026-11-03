// Public browse + listing detail (FR-B1/B2). Anyone may look, signed
// out included. Privacy: a phone number is NEVER in the browse list,
// and appears on the detail view only when the donor opted in AND the
// viewer is signed in. Filtering/sorting happen in the app over the
// full set returned here - there is deliberately no pagination.
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

const router = express.Router();

const LIVE_FAMILY = ['LIVE', 'PARTIALLY_CLAIMED', 'FULLY_CLAIMED'];

// Optional sign-in: a valid access token identifies the viewer;
// anything else just means "visitor". Never rejects the request.
async function softAuth(req, res, next) {
  req.viewer = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const userId = payload.userId || payload.sub || payload.id;
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user && !user.isSuspended) req.viewer = user;
      }
    } catch { /* expired/invalid token -> just a visitor */ }
  }
  next();
}

const providerSelect = { select: { name: true, accountType: true, orgName: true, ngoVerificationStatus: true }};

const cardFields = {
  id: true, foodName: true, category: true, categoryNote: true, dietaryType: true,
  portionType: true, portionCount: true, portionsRemaining: true, bulkUnit: true,
  photoUrl: true, pickupLocation: true, deadline: true, status: true, createdAt: true, latitude: true, longitude: true,
  provider: providerSelect,
};

router.get('/', softAuth, async (req, res) => {
  const listings = await prisma.listing.findMany({
    where: { status: { in: LIVE_FAMILY }, deadline: { gt: new Date() } },
    orderBy: { deadline: 'asc' },
    select: cardFields,
  });
  const out = listings.map((l) => {
  const v = l.provider?.accountType === 'NGO' && l.provider?.ngoVerificationStatus === 'VERIFIED';
  return { ...l, providerVerified: v, provider: { ...l.provider, providerVerified: v } };
});
res.json({ listings: out });

});

router.get('/:id', softAuth, async (req, res) => {
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, status: { in: LIVE_FAMILY }, deadline: { gt: new Date() } },
    select: { ...cardFields, details: true, safetyChecklist: true, showContact: true, contactPhone: true },
  });
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  const { showContact, contactPhone, ...pub } = listing;
  if (showContact && req.viewer) pub.contactPhone = contactPhone;
  pub.providerVerified = pub.provider?.accountType === 'NGO' && pub.provider?.ngoVerificationStatus === 'VERIFIED';
if (pub.provider) pub.provider.providerVerified = pub.providerVerified;

res.json({ listing: pub });
});

module.exports = router;
