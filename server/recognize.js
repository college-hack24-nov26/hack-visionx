// Photo recognition (P1): forwards a donor's food photo to the local
// inference service and turns its answer into an editable suggestion.
// If the service is down we say so honestly (503) - never a fake guess.
const express = require('express');
const multer = require('multer');
const { requireAuth, requireNotSuspended } = require('./auth');
const { suggestionFor } = require('./dishInfo');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const INFERENCE_URL = process.env.INFERENCE_URL || 'http://localhost:8001';

function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const gif = buf.toString('ascii', 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  return null;
}

router.post('/', requireAuth, requireNotSuspended, upload.single('photo'), async (req, res) => {
  const u = req.user;
  if (!(u.accountType === 'NGO' || u.activeRole === 'PROVIDER')) {
    return res.status(403).json({ error: 'Switch to Donor mode to post food' });
  }
  if (!req.file) return res.status(400).json({ error: 'A photo is required' });
  const type = sniffImageType(req.file.buffer);
  if (!type) return res.status(400).json({ error: 'That file is not a supported image' });

  let data;
  try {
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type }), req.file.originalname || 'photo');
    const r = await fetch(`${INFERENCE_URL}/predict`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`inference ${r.status}`);
    data = await r.json();
  } catch (e) {
    return res.status(503).json({ error: 'Recognition is unavailable right now - you can still type the details.' });
  }

  const s = suggestionFor(data.featured.label);
  res.json({
    suggestion: { ...s, confidence: data.featured.confidence, source: data.featured.source },
    alternatives: (data.alternatives || []).map((a) => ({
      foodName: suggestionFor(a.label).foodName, confidence: a.confidence, source: a.source,
    })),
  });
});

module.exports = router;
