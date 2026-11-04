// Claims and pickup codes (FR-C1..C8). A claim instantly confirms and
// decrements portions atomically, so simultaneous claims can never
// oversell. The pickup code is stored only as a salted hash (for the
// donor's verification) plus an AES-256-GCM encrypted copy so the
// claim's owner - and only the owner - can re-view it while active.
// The encrypted copy is erased at every terminal state.
const express = require('express');
const crypto = require('crypto');
const prisma = require('./prisma');
const { requireAuth, requireNotSuspended } = require('./auth');
const { notify } = require('./notify');


const router = express.Router();
router.use(requireAuth, requireNotSuspended);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I/O/0/1
const LIVE_FOR_CLAIMS = ['LIVE', 'PARTIALLY_CLAIMED'];

// Great-circle distance (km) between two {lat, lng} points.
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function genCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s;
}
function hashCode(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}
function encKey() {
  const k = Buffer.from(process.env.PICKUP_CODE_KEY || '', 'hex');
  if (k.length !== 32) throw new Error('PICKUP_CODE_KEY missing or not 32 bytes');
  return k;
}
function encryptCode(code) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}
function decryptCode(payload) {
  const [iv, tag, data] = payload.split('.').map((x) => Buffer.from(x, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
// Never let the hash/salt/encrypted copy leave the server in a claim object.
function liveStateOf(c) {
  if (!c.liveUpdatedAt) return null;
  if (!c.liveSharing) return 'stopped';
  return Date.now() - new Date(c.liveUpdatedAt).getTime() <= 60000 ? 'live' : 'stale';
}

function publicClaim(claim) {
  if (!claim) return claim;
  const { codeHash, codeSalt, codeEncrypted, ...pub } = claim;
  return { ...pub, liveState: liveStateOf(claim) };

}

// ---- Create a claim (FR-C1/C2/C3) ----
router.post('/', async (req, res) => {
  const u = req.user;
  const canClaim = u.accountType === 'NGO' || (u.accountType === 'USER' && u.activeRole === 'CLAIMER');
  if (!canClaim) {
    return res.status(403).json({ error: u.activeRole === 'PROVIDER' ? 'Switch to Claimer mode to claim food' : 'This account cannot claim food' });
  }
  const { listingId, portions } = req.body || {};
  const n = Number(portions);
  if (!listingId) return res.status(400).json({ errors: { listingId: 'Missing listing' } });
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ errors: { portions: 'Claim at least 1 portion' } });

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.providerId === u.id) return res.status(403).json({ error: 'You cannot claim your own listing' });
  if (!LIVE_FOR_CLAIMS.includes(listing.status)) return res.status(409).json({ error: 'This listing is not open for claims' });
  if (listing.deadline && listing.deadline.getTime() <= Date.now()) return res.status(409).json({ error: 'This listing has expired' });
  // FR-B4 enforced on the server: when the listing has a pickup point,
  // the claimer's location (sent once with the claim, never stored) must
  // be within 5 km - the browse filter alone is not enforcement.
  if (listing.latitude != null && listing.longitude != null) {
    const la = Number(req.body?.claimerLat);
    const ln = Number(req.body?.claimerLng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      return res.status(400).json({ errors: { location: 'Set your location before claiming - pickups are limited to within 5 km of the pickup point.' } });
    }
    const distKm = haversineKm({ lat: la, lng: ln }, { lat: listing.latitude, lng: listing.longitude });
    if (distKm > 5) {
      return res.status(403).json({ error: `This pickup point is ${distKm.toFixed(1)} km away. Claims are limited to within 5 km.` });
    }
  }
  if (n > (listing.portionsRemaining ?? 0)) {
    return res.status(400).json({ errors: { portions: `Only ${listing.portionsRemaining} portions remain` } });
  }

  const code = genCode();
  const salt = crypto.randomBytes(16).toString('hex');
  try {
    const claim = await prisma.$transaction(async (tx) => {
      // Atomic check-and-decrement: this update only succeeds if enough
      // portions remain at the moment it runs (FR-C2).
      const dec = await tx.listing.updateMany({
        where: { id: listing.id, status: { in: LIVE_FOR_CLAIMS }, portionsRemaining: { gte: n }, deadline: { gt: new Date() } },
        data: { portionsRemaining: { decrement: n } },
      });
      if (dec.count !== 1) throw Object.assign(new Error('oversold'), { code: 'OVERSOLD' });
      const fresh = await tx.listing.findUnique({ where: { id: listing.id } });
      await tx.listing.update({
        where: { id: listing.id },
        data: { status: fresh.portionsRemaining === 0 ? 'FULLY_CLAIMED' : 'PARTIALLY_CLAIMED' },
      });
      return tx.claim.create({
        data: {
          listingId: listing.id, claimerId: u.id, portions: n,
          codeHash: hashCode(code, salt), codeSalt: salt, codeEncrypted: encryptCode(code),
        },
      });
    });

    await notify({
    userId: listing.providerId, type: 'CLAIM_PLACED',
    title: `${u.name} claimed ${n} portions of ${listing.foodName}`,
    body: 'Open your listing to see the claim.',
    listingId: listing.id, claimId: claim.id,
  });

    // The plaintext code is returned ONCE here; afterwards only the
    // owner-only re-view endpoint can show it again.
    res.status(201).json({ claim: publicClaim(claim), pickupCode: code });
  } catch (e) {
    if (e.code === 'OVERSOLD') return res.status(409).json({ error: 'Not enough portions remaining' });
    throw e;
  }
});

// ---- My Claims (claimer view; never includes codes - FR-C3) ----
router.get('/mine', async (req, res) => {
  const claims = await prisma.claim.findMany({
    where: { claimerId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      listing: {
        select: {
          id: true, foodName: true, photoUrl: true, pickupLocation: true, latitude: true, longitude: true, deadline: true,

          status: true, portionType: true, bulkUnit: true,
          provider: { select: { name: true, accountType: true, orgName: true } },
        },
      },
    },
  });
  res.json({ claims: claims.map(publicClaim) });
});

// ---- Claims on my listings (donor view; never includes codes) ----
router.get('/received', async (req, res) => {
  const claims = await prisma.claim.findMany({
    where: { listing: { providerId: req.user.id } },
    orderBy: { createdAt: 'desc' },
    include: {
      claimer: { select: { name: true, accountType: true, orgName: true } },
      listing: { select: { id: true, foodName: true, deadline: true, status: true } },
    },
  });
  res.json({ claims: claims.map(publicClaim) });
});

// ---- Re-view my pickup code (owner only, active claims only - FR-C3) ----
router.get('/:id/code', async (req, res) => {
  const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.claimerId !== req.user.id) return res.status(403).json({ error: 'This is not your claim' });
  if (claim.status !== 'CONFIRMED' || !claim.codeEncrypted) {
    return res.status(409).json({ error: 'This claim is no longer active' });
  }
  res.json({ code: decryptCode(claim.codeEncrypted) });
});

// ---- Cancel my claim (FR-C5: the 30-minute rule) ----
router.post('/:id/cancel', async (req, res) => {
  const claim = await prisma.claim.findUnique({ where: { id: req.params.id }, include: { listing: true } });
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.claimerId !== req.user.id) return res.status(403).json({ error: 'This is not your claim' });
  if (claim.status !== 'CONFIRMED') return res.status(409).json({ error: 'This claim is already closed' });

  const minutesLeft = (claim.listing.deadline.getTime() - Date.now()) / 60000;
  const onTime = minutesLeft >= 30;
  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.claim.update({
      where: { id: claim.id },
      data: { status: onTime ? 'CANCELLED' : 'CANCELLED_LATE', codeEncrypted: null },
    });
    if (onTime && LIVE_FOR_CLAIMS.concat('FULLY_CLAIMED').includes(claim.listing.status)) {
      const l = await tx.listing.update({
        where: { id: claim.listingId },
        data: { portionsRemaining: { increment: claim.portions } },
      });
      await tx.listing.update({
        where: { id: claim.listingId },
        data: { status: l.portionsRemaining >= (l.portionCount ?? l.portionsRemaining) ? 'LIVE' : 'PARTIALLY_CLAIMED' },
      });
    }
    return c;
  });
  await notify({
  userId: claim.listing.providerId, type: 'CLAIM_CANCELLED',
  title: `${req.user.name} cancelled a claim on ${claim.listing.foodName}`,
  body: onTime ? 'The portions were returned to the listing.' : 'Cancelled inside 30 minutes of the deadline, so the portions were not returned.',
  listingId: claim.listingId, claimId: claim.id,
  });

  res.json({ claim: publicClaim(updated), portionsReturned: onTime });
});

// ---- On the way (FR-C6: exactly once; donor notification arrives in Slice 5) ----
router.post('/:id/on-the-way', async (req, res) => {
  const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.claimerId !== req.user.id) return res.status(403).json({ error: 'This is not your claim' });
  if (claim.status !== 'CONFIRMED') return res.status(409).json({ error: 'This claim is already closed' });
  if (claim.onWayAt) return res.status(409).json({ error: 'Already marked as on the way' });
  const updated = await prisma.claim.update({ where: { id: claim.id }, data: { onWayAt: new Date() } });
  const listing = await prisma.listing.findUnique({ where: { id: claim.listingId }, select: { foodName: true, providerId: true } });
await notify({
  userId: listing.providerId, type: 'CLAIMER_ON_THE_WAY',
  title: `${req.user.name} is on the way to collect ${listing.foodName}`,
  body: 'The claimer has signalled they are coming for pickup.',
  listingId: claim.listingId, claimId: claim.id,
});

  res.json({ claim: publicClaim(updated) });
});

// ---- Donor shares live location for this claim (FR-M1) ----
router.post('/:id/live-location', async (req, res) => {
  const claim = await prisma.claim.findUnique({ where: { id: req.params.id }, include: { listing: true } });
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.listing.providerId !== req.user.id) return res.status(403).json({ error: 'This is not your listing' });
  if (claim.status !== 'CONFIRMED') return res.status(409).json({ error: 'This claim is no longer active' });
  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'A valid location is required' });
  }
  const updated = await prisma.claim.update({
    where: { id: claim.id },
    data: { liveLat: latitude, liveLng: longitude, liveUpdatedAt: new Date(), liveSharing: true },
  });
  res.json({ claim: publicClaim(updated) });
});

// ---- Donor stops sharing live location (FR-M1) ----
router.post('/:id/live-location/stop', async (req, res) => {
  const claim = await prisma.claim.findUnique({ where: { id: req.params.id }, include: { listing: true } });
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.listing.providerId !== req.user.id) return res.status(403).json({ error: 'This is not your listing' });
  const updated = await prisma.claim.update({ where: { id: claim.id }, data: { liveSharing: false } });
  res.json({ claim: publicClaim(updated) });
});


// ---- Donor verifies a pickup code (FR-C7) ----
router.post('/:id/verify', async (req, res) => {
  const claim = await prisma.claim.findUnique({ where: { id: req.params.id }, include: { listing: true } });
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.listing.providerId !== req.user.id) return res.status(403).json({ error: 'This is not your listing' });
  if (claim.status === 'COLLECTED') {
    return res.json({ claim: publicClaim(claim), alreadyCollected: true });
  }
  if (claim.status !== 'CONFIRMED') return res.status(409).json({ error: 'This claim is already closed' });
  if (claim.verifyLockedUntil && claim.verifyLockedUntil.getTime() > Date.now()) {
    return res.status(423).json({ error: 'Verification is locked for a few minutes after too many wrong attempts', locked: true });
  }
  const entered = String((req.body || {}).code || '').trim().toUpperCase();
  const candidate = Buffer.from(hashCode(entered, claim.codeSalt), 'hex');
  const stored = Buffer.from(claim.codeHash, 'hex');
  const match = candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
  if (!match) {
    const attempts = claim.verifyAttempts + 1;
    const data = { verifyAttempts: attempts };
    if (attempts >= 5) {
      data.verifyAttempts = 0;
      data.verifyLockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    }
    await prisma.claim.update({ where: { id: claim.id }, data });
    return res.status(401).json({ error: 'Incorrect pickup code' });
  }
  const updated = await prisma.claim.update({
    where: { id: claim.id },
    data: { status: 'COLLECTED', collectedAt: new Date(), codeEncrypted: null, verifyAttempts: 0, verifyLockedUntil: null },
  });
  await notify({
  userId: claim.claimerId, type: 'CLAIM_COLLECTED',
  title: `Collected: ${claim.listing.foodName}`,
  body: 'Your pickup was verified by the donor. Enjoy!',
  listingId: claim.listingId, claimId: claim.id,
});

  res.json({ claim: publicClaim(updated) });
});

module.exports = router;

