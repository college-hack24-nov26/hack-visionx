// NGO verification (P1): document upload + status for NGO accounts.
// Documents are stored under server/uploads/docs/ and served by the
// existing /uploads static route, so the admin can open them from the queue.
// Redistribution log (FR-N4): verified NGOs record what they gave out.
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const prisma = require('./prisma');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

function requireNgo(req, res, next) {
  if (req.user.accountType !== 'NGO') {
    return res.status(403).json({ error: 'Only NGO accounts can do this' });
  }
  next();
}

// File type from the first bytes of the file itself (never trust the name).
function sniffType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/document', requireNgo, (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: 'Upload failed - the file must be 5 MB or smaller' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const type = sniffType(req.file.buffer);
    if (!type) {
      return res.status(400).json({ error: 'Only PDF, JPEG or PNG documents are accepted' });
    }
    try {
      const dir = path.join(__dirname, 'uploads', 'docs');
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `${req.user.id}.${type}`;
      fs.writeFileSync(path.join(dir, fileName), req.file.buffer);
      const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          ngoVerificationStatus: 'PENDING',
          ngoDocFile: fileName,
          ngoDocName: req.file.originalname,
          ngoSubmittedAt: new Date(),
          ngoReviewNote: null,
        },
      });
      res.json({
        status: updated.ngoVerificationStatus,
        docName: updated.ngoDocName,
        submittedAt: updated.ngoSubmittedAt,
      });
    } catch (e) {
      console.error('ngo document upload failed:', e.message);
      res.status(500).json({ error: 'Could not save the document' });
    }
  });
});

router.get('/status', (req, res) => {
  const u = req.user;
  res.json({
    status: u.ngoVerificationStatus,
    docName: u.ngoDocName,
    submittedAt: u.ngoSubmittedAt,
    reviewNote: u.ngoReviewNote,
  });
});

// Portions this NGO has actually collected, minus what it already logged
// as redistributed - the ceiling for any new entry, so the log can never
// claim more food than the NGO really picked up.
async function redistributionBalance(ngoId) {
  const collected = await prisma.claim.aggregate({
    _sum: { portions: true },
    where: { claimerId: ngoId, status: 'COLLECTED' },
  });
  const logged = await prisma.redistributionLog.aggregate({
    _sum: { portions: true },
    where: { ngoId },
  });
  return (collected._sum.portions || 0) - (logged._sum.portions || 0);
}

// Redistribution log: create an entry for the signed-in NGO.
router.post('/redistributions', requireNgo, async (req, res) => {
  const portions = Number(req.body && req.body.portions);
  const peopleServed = Number(req.body && req.body.peopleServed);
  if (!Number.isInteger(portions) || portions <= 0) {
    return res.status(400).json({ error: 'Portions must be a positive whole number' });
  }
  if (!Number.isInteger(peopleServed) || peopleServed <= 0) {
    return res.status(400).json({ error: 'People served must be a positive whole number' });
  }
  const note = typeof (req.body && req.body.note) === 'string' && req.body.note.trim()
    ? req.body.note.trim() : null;
  const claimId = typeof (req.body && req.body.claimId) === 'string' && req.body.claimId.trim()
    ? req.body.claimId.trim() : null;
  const DESTINATION_KINDS = ['Shelter', 'Old-age home', 'Orphanage', 'Street distribution', 'Other'];
  const destinationKind = typeof (req.body && req.body.destinationKind) === 'string' && req.body.destinationKind.trim()
    ? req.body.destinationKind.trim() : null;
  if (destinationKind !== null && !DESTINATION_KINDS.includes(destinationKind)) {
    return res.status(400).json({ error: 'Destination kind is not valid' });
  }
  const available = await redistributionBalance(req.user.id);
  if (portions > available) {
    return res.status(400).json({
      error: available <= 0
        ? 'You have no collected portions waiting to be logged - collect a claim first.'
        : `You can log at most ${available} portions - that is what you have collected and not yet redistributed.`,
    });
  }
  try {
    const entry = await prisma.redistributionLog.create({
      data: { ngoId: req.user.id, claimId, portions, peopleServed, note, destinationKind },
    });
    res.status(201).json({ entry });
  } catch (e) {
    console.error('redistribution create failed:', e.message);
    res.status(500).json({ error: 'Could not log the redistribution' });
  }
});

// Redistribution log: the signed-in NGO's entries, newest first, plus totals.
router.get('/redistributions', requireNgo, async (req, res) => {
  const entries = await prisma.redistributionLog.findMany({
    where: { ngoId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  let totalPortions = 0;
  let totalPeopleServed = 0;
  for (const e of entries) {
    totalPortions += e.portions;
    totalPeopleServed += e.peopleServed;
  }
  const available = await redistributionBalance(req.user.id);
  res.json({ entries, totals: { totalPortions, totalPeopleServed }, available });
});

module.exports = router;

