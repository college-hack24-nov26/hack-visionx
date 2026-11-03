// Listings: donors create drafts, complete them, and publish them.
// Drafts may be incomplete (FR-L1); publishing enforces the full
// rules including the 8-point food-safety checklist (FR-L3).
const express = require('express');
const prisma = require('./prisma');
const { requireAuth, requireNotSuspended } = require('./auth');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { notify } = require('./notify');



const router = express.Router();
router.use(requireAuth, requireNotSuspended);

const CATEGORIES = ['COOKED_MEALS', 'RAW_PRODUCE', 'BAKERY', 'DAIRY', 'PACKAGED_FOOD', 'BEVERAGES', 'OTHER'];
const DIETARY = ['VEG', 'NON_VEG', 'VEGAN'];
const PORTIONS = ['INDIVIDUAL_MEALS', 'BULK_SERVINGS', 'KILOGRAMS', 'LITRES', 'PACKETS'];
const SAFETY_IDS = ['HYGIENE_PREP', 'DECLARED_STORAGE', 'NOT_PREVIOUSLY_SERVED', 'COOKED_TIME_ACCURATE', 'NO_SPOILAGE_SIGNS', 'COVERED_PACKAGING', 'DEADLINE_FINAL', 'DONOR_DECLARATION'];
const BULK_TYPES = ['KILOGRAMS', 'LITRES'];

function cleanPhone(raw) {
  if (typeof raw !== 'string') return null;
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? d : null;
}

// Pull only the editable fields out of a request body, validating as we go.
function extractFields(body, errors) {
  const data = {};
  if (body.foodName !== undefined) data.foodName = String(body.foodName).trim();
  if (body.details !== undefined) data.details = String(body.details).trim();
  if (body.category !== undefined) {
    if (CATEGORIES.includes(body.category)) data.category = body.category;
    else errors.category = 'Unknown category';
  }
  if (body.categoryNote !== undefined) data.categoryNote = body.categoryNote ? String(body.categoryNote).trim() : null;
  if (body.dietaryType !== undefined) {
    if (DIETARY.includes(body.dietaryType)) data.dietaryType = body.dietaryType;
    else errors.dietaryType = 'Unknown dietary type';
  }
  if (body.portionType !== undefined) {
    if (PORTIONS.includes(body.portionType)) data.portionType = body.portionType;
    else errors.portionType = 'Unknown portion type';
  }
  if (body.portionCount !== undefined) {
    const n = Number(body.portionCount);
    if (Number.isInteger(n) && n >= 1) data.portionCount = n;
    else errors.portionCount = 'Portions must be a whole number of 1 or more';
  }
  if (body.bulkUnit !== undefined) data.bulkUnit = body.bulkUnit ? String(body.bulkUnit).trim() : null;
  if (body.pickupLocation !== undefined) data.pickupLocation = String(body.pickupLocation).trim();
  if (body.contactPhone !== undefined) {
    if (body.contactPhone === '') data.contactPhone = '';
    else {
      const p = cleanPhone(body.contactPhone);
      if (p) data.contactPhone = p;
      else errors.contactPhone = 'Enter a valid 10-digit mobile number';
    }
  }
  if (body.showContact !== undefined) data.showContact = !!body.showContact;
  if (body.safetyChecklist !== undefined) {
    if (Array.isArray(body.safetyChecklist)) data.safetyChecklist = body.safetyChecklist.filter((x) => SAFETY_IDS.includes(x));
    else errors.safetyChecklist = 'Checklist must be a list';
  }
  if (body.deadline !== undefined) {
    if (body.deadline === null || body.deadline === '') data.deadline = null;
    else {
      const d = new Date(body.deadline);
      if (isNaN(d)) errors.deadline = 'Deadline is not a valid date/time';
      else data.deadline = d;
    }
  }
  if (body.latitude !== undefined || body.longitude !== undefined) {
  if (body.latitude === null && body.longitude === null) {
    data.latitude = null;
    data.longitude = null;
  } else {
    const la = Number(body.latitude);
    const lo = Number(body.longitude);
    if (Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
      data.latitude = la;
      data.longitude = lo;
    } else {
      errors.pickupPoint = 'Pickup point needs a valid latitude and longitude together';
    }
  }
}

return data;
}

// Load a listing and check the caller owns it. Sends the error reply itself.
async function ownListing(req, res) {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) { res.status(404).json({ error: 'Listing not found' }); return null; }
  if (listing.providerId !== req.user.id) { res.status(403).json({ error: 'This is not your listing' }); return null; }
  return listing;
}

router.post('/', async (req, res) => {
  if (req.user.activeRole !== 'PROVIDER') {
    return res.status(403).json({ error: 'Switch to Donor mode to post food' });
  }
  const recentCount = await prisma.listing.count({ where: { providerId: req.user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recentCount >= 10) {
    return res.status(429).json({ error: 'You are posting too quickly - please wait a little before adding more listings.' });
  }
  const errors = {};
  const data = extractFields(req.body || {}, errors);
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  const listing = await prisma.listing.create({
    data: { ...data, providerId: req.user.id, portionsRemaining: data.portionCount ?? null },
  });
  res.status(201).json({ listing });
});

router.get('/mine', async (req, res) => {
  const listings = await prisma.listing.findMany({
    where: { providerId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ listings });
});

router.get('/:id', async (req, res) => {
  const listing = await ownListing(req, res);
  if (!listing) return;
  res.json({ listing });
});

router.patch('/:id', async (req, res) => {
  const listing = await ownListing(req, res);
  if (!listing) return;
  if (!['DRAFT', 'LIVE'].includes(listing.status)) {
    return res.status(409).json({ error: 'This listing can no longer be edited' });
  }
  const errors = {};
  const data = extractFields(req.body || {}, errors);
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  if (data.portionCount !== undefined) {
    // Keep whatever was already claimed claimed (claims arrive in Slice 4).
    const claimed = listing.portionCount != null && listing.portionsRemaining != null
      ? listing.portionCount - listing.portionsRemaining
      : 0;
    data.portionsRemaining = Math.max(0, data.portionCount - claimed);
  }
  const updated = await prisma.listing.update({ where: { id: listing.id }, data });
  // FR-NT1: tell every claimer-role account about the new listing.
  const recipients = await prisma.user.findMany({
  where: { isSuspended: false, id: { not: req.user.id }, OR: [{ accountType: 'NGO' }, { accountType: 'USER', activeRole: 'CLAIMER' }] },
  select: { id: true },
 });
  for (const r of recipients) {
    await notify({
    userId: r.id, type: 'LISTING_PUBLISHED',
    title: `New food available: ${updated.foodName}`,
    body: `${updated.portionCount} portions at ${updated.pickupLocation}`,
    listingId: updated.id,
  });
}

  res.json({ listing: updated });
});

function publishErrors(l) {
  const errors = {};
  if (!l.foodName.trim()) errors.foodName = 'Give the food a name';
  if (!l.category) errors.category = 'Choose a category';
  if (!l.dietaryType) errors.dietaryType = 'Choose veg / non-veg / vegan';
  if (!l.portionType) errors.portionType = 'Choose how portions are measured';
  if (!l.portionCount || l.portionCount < 1) errors.portionCount = 'Say how many portions';
  if (BULK_TYPES.includes(l.portionType) && !l.bulkUnit) errors.bulkUnit = 'Say the size of one unit, e.g. 1 kg bag';
  if (!l.pickupLocation.trim()) errors.pickupLocation = 'Say where to collect from';
  if (!cleanPhone(l.contactPhone)) errors.contactPhone = 'Add a valid 10-digit contact number';
  if (!l.deadline) errors.deadline = 'Set a collection deadline';
  else if (l.deadline.getTime() <= Date.now()) errors.deadline = 'Deadline has already passed';
  else if (l.deadline.getTime() > Date.now() + 24 * 60 * 60 * 1000) errors.deadline = 'Deadline must be within 24 hours';
  if (SAFETY_IDS.some((id) => !l.safetyChecklist.includes(id))) {
    errors.safetyChecklist = 'Confirm all 8 food-safety declarations';
  }
  return errors;
}

router.post('/:id/publish', async (req, res) => {
  const listing = await ownListing(req, res);
  if (!listing) return;
  if (listing.status === 'LIVE') return res.status(409).json({ error: 'Already published' });
  if (listing.status !== 'DRAFT') return res.status(409).json({ error: 'Only a draft can be published' });
  const errors = publishErrors(listing);
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: { status: 'LIVE', portionsRemaining: listing.portionCount },
  });
  res.json({ listing: updated });
});

router.post('/:id/cancel', async (req, res) => {
  const listing = await ownListing(req, res);
  if (!listing) return;
  if (!['DRAFT', 'LIVE', 'PARTIALLY_CLAIMED'].includes(listing.status)) {
    return res.status(409).json({ error: 'This listing is already closed' });
  }
  // Open claims on it are cancelled too â€” claims arrive in Slice 4.
  const updated = await prisma.listing.update({ where: { id: listing.id }, data: { status: 'CANCELLED' } });
  const openClaims = await prisma.claim.findMany({ where: { listingId: listing.id, status: 'CONFIRMED' } });
  // FR-C8: open claims on a cancelled listing are cancelled by the provider.
  await prisma.claim.updateMany({
  where: { listingId: listing.id, status: 'CONFIRMED' },
  data: { status: 'CANCELLED_BY_PROVIDER', codeEncrypted: null },
});

for (const c of openClaims) {
  await notify({
    userId: c.claimerId, type: 'LISTING_CANCELLED',
    title: `Listing cancelled by the donor: ${listing.foodName}`,
    body: 'This listing was cancelled, so your claim on it has been cancelled too.',
    listingId: listing.id, claimId: c.id,
  });
}


  res.json({ listing: updated });
});

// ---- Photo upload (FR-L2): one photo per listing, verified by content ----
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Work out the real image type from the file's first bytes (magic numbers),
// never trusting the file name or the type the browser claims.
function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

router.post('/:id/photo', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Photo must be 5 MB or smaller' });
      return res.status(400).json({ error: 'Upload failed' });
    }
    const listing = await ownListing(req, res);
    if (!listing) return;
    if (!['DRAFT', 'LIVE'].includes(listing.status)) {
      return res.status(409).json({ error: 'This listing can no longer be edited' });
    }
    if (!req.file) return res.status(400).json({ error: 'No photo file was sent (field name: photo)' });
    const ext = sniffImage(req.file.buffer);
    if (!ext) return res.status(400).json({ error: 'That file is not an image - we check the file content, not its name' });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    for (const old of ['jpg', 'png', 'gif', 'webp']) {
      if (old !== ext) { try { fs.unlinkSync(path.join(UPLOAD_DIR, `${listing.id}.${old}`)); } catch { /* no old file */ } }
    }
    fs.writeFileSync(path.join(UPLOAD_DIR, `${listing.id}.${ext}`), req.file.buffer);
    const updated = await prisma.listing.update({
      where: { id: listing.id },
      data: { photoUrl: `/uploads/${listing.id}.${ext}` },
    });
    res.json({ listing: updated });
  });
});


module.exports = router;
