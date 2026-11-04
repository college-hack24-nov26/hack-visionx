const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('./prisma');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------- helpers ----------

function normalizeMobile(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, mobile: u.mobile,
    accountType: u.accountType, activeRole: u.activeRole,
    orgName: u.orgName, orgRegNo: u.orgRegNo, orgAddress: u.orgAddress,
    profilePhotoUrl: u.profilePhotoUrl, preferredLanguage: u.preferredLanguage,
    isSuspended: u.isSuspended, isMainAdmin: u.isMainAdmin,
    createdAt: u.createdAt,
  };
}

// A suspension with an end time lifts itself the first time it is
// checked after that time; one without an end time lasts until an
// admin lifts it. Returns the active suspension or null.
async function activeSuspension(user) {
  if (!user.isSuspended) return null;
  if (user.suspendedUntil && new Date(user.suspendedUntil).getTime() <= Date.now()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isSuspended: false, suspendedUntil: null, suspendReason: null, spamStrikes: 0 },
    }).catch(() => {});
    user.isSuspended = false;
    user.suspendedUntil = null;
    user.suspendReason = null;
    return null;
  }
  return {
    suspendedUntil: user.suspendedUntil,
    suspendReason: user.suspendReason || 'Suspended by an admin.',
  };
}

function suspendedBody(s) {
  return {
    error: 'This account is suspended.',
    suspended: true,
    suspendedUntil: s.suspendedUntil,
    suspendReason: s.suspendReason,
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSessionAndTokens(userId) {
  const session = await prisma.session.create({
    data: { userId, refreshHash: 'pending', expiresAt: new Date(Date.now() + REFRESH_MS) },
  });
  const refreshToken = jwt.sign({ sub: userId, sid: session.id }, REFRESH_SECRET, { expiresIn: '7d' });
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshHash: hashToken(refreshToken) },
  });
  const accessToken = jwt.sign({ sub: userId }, ACCESS_SECRET, { expiresIn: '15m' });
  return { accessToken, refreshToken };
}

// ---------- throttling: 10 FAILED attempts per 15 min, per concern ----------

const failures = new Map();
const LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

function throttleWaitMinutes(concern, ip) {
  const rec = failures.get(concern + ':' + ip);
  if (!rec) return 0;
  if (Date.now() > rec.resetAt) { failures.delete(concern + ':' + ip); return 0; }
  if (rec.count >= LIMIT) return Math.max(1, Math.ceil((rec.resetAt - Date.now()) / 60000));
  return 0;
}

function recordFailure(concern, ip) {
  const key = concern + ':' + ip;
  const rec = failures.get(key);
  if (!rec || Date.now() > rec.resetAt) failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  else rec.count += 1;
}

// ---------- middleware ----------

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    const payload = jwt.verify(token, ACCESS_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'Sign in required' });
    const susp = await activeSuspension(user);
    if (susp && !(req.originalUrl || '').endsWith('/api/auth/logout')) {
      return res.status(403).json(suspendedBody(susp));
    }
    req.user = user; // always the FRESH database row - role switches apply at once
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireNotSuspended(req, res, next) {
  if (req.user && req.user.isSuspended) {
    return res.status(403).json({ error: 'This account is suspended, so it cannot make changes.' });
  }
  next();
}

// ---------- routes ----------

router.post('/register', async (req, res) => {
  try {
    const wait = throttleWaitMinutes('register', req.ip);
    if (wait) return res.status(429).json({ error: `Too many failed attempts. Try again in ${wait} minute(s).` });

    const body = req.body || {};
    const errors = {};
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const mobile = normalizeMobile(body.mobile);
    const password = body.password || '';
    const type = body.accountType === 'NGO' ? 'NGO' : 'USER';

    if (name.length < 2) errors.name = 'Please enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Please enter a valid email address';
    if (mobile.length !== 10) errors.mobile = 'Mobile number must be exactly 10 digits';
    if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (type === 'NGO' && !(body.orgName || '').trim()) errors.orgName = 'Please enter the organisation name';

    if (Object.keys(errors).length > 0) {
      recordFailure('register', req.ip);
      return res.status(400).json({ errors });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { mobile }] },
    });
    if (existing) {
      // FR-A2: neutral answer - never reveal WHICH field matched, create nothing.
      return res.status(200).json({
        ok: true,
        message: 'Please log in to continue. If you already had an account, that account is unchanged.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let invitedById = null;
    const inviteCode = (body.inviteCode || '').trim();
    if (inviteCode) {
      const inviter = await prisma.user.findUnique({ where: { id: inviteCode }, select: { id: true } });
      if (inviter) invitedById = inviter.id;
    }
    const user = await prisma.user.create({
      data: {
        name, email, mobile, passwordHash, invitedById,
        accountType: type,
        activeRole: type === 'NGO' ? 'NGO' : 'CLAIMER',
        orgName: type === 'NGO' ? body.orgName.trim() : null,
        orgRegNo: type === 'NGO' ? (body.orgRegNo || '').trim() || null : null,
        orgAddress: type === 'NGO' ? (body.orgAddress || '').trim() || null : null,
      },
    });
    const susp = await activeSuspension(user);
    if (susp) return res.status(403).json(suspendedBody(susp));
    const tokens = await createSessionAndTokens(user.id);
    return res.status(201).json({ user: publicUser(user), ...tokens });
  } catch (err) {
    return res.status(500).json({ error: 'Registration failed unexpectedly' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const wait = throttleWaitMinutes('login', req.ip);
    if (wait) return res.status(429).json({ error: `Too many failed attempts. Try again in ${wait} minute(s).` });

    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) {
      recordFailure('login', req.ip);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const tokens = await createSessionAndTokens(user.id);
    return res.json({ user: publicUser(user), ...tokens });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed unexpectedly' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });
    const payload = jwt.verify(refreshToken, REFRESH_SECRET);
    const session = await prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub || session.expiresAt < new Date()
        || session.refreshHash !== hashToken(refreshToken)) {
      if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return res.status(401).json({ error: 'Session expired - please log in again' });
    }
    const ruser = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (ruser) {
      const susp = await activeSuspension(ruser);
      if (susp) return res.status(403).json(suspendedBody(susp));
    }
    const newRefresh = jwt.sign({ sub: payload.sub, sid: session.id }, REFRESH_SECRET, { expiresIn: '7d' });
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshHash: hashToken(newRefresh), expiresAt: new Date(Date.now() + REFRESH_MS) },
    });
    const accessToken = jwt.sign({ sub: payload.sub }, ACCESS_SECRET, { expiresIn: '15m' });
    return res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    return res.status(401).json({ error: 'Session expired - please log in again' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) {
      const payload = jwt.verify(refreshToken, REFRESH_SECRET);
      await prisma.session.delete({ where: { id: payload.sid } }).catch(() => {});
    }
  } catch (err) { /* logging out always "works" from the caller's side */ }
  return res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/switch-role', requireAuth, async (req, res) => {
  try {
    if (req.user.accountType !== 'USER') {
      return res.status(403).json({ error: 'Only user accounts can switch between Claimer and Donor mode' });
    }
    const role = req.body?.role;
    if (!['CLAIMER', 'PROVIDER'].includes(role)) {
      return res.status(422).json({ error: 'Role must be CLAIMER or PROVIDER' });
    }
    const updated = await prisma.user.update({ where: { id: req.user.id }, data: { activeRole: role } });
    return res.json({ user: publicUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: 'Role switch failed unexpectedly' });
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const errors = {};
    const name = (req.body?.name ?? req.user.name).trim();
    const mobile = normalizeMobile(req.body?.mobile ?? req.user.mobile);
    const preferredLanguage = req.body?.preferredLanguage ?? req.user.preferredLanguage ?? 'en';
if (!['en', 'mr', 'hi'].includes(preferredLanguage)) errors.preferredLanguage = 'Unsupported language';

    if (name.length < 2) errors.name = 'Please enter your full name';
    if (mobile.length !== 10) errors.mobile = 'Mobile number must be exactly 10 digits';
    if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

    if (mobile !== req.user.mobile) {
      const clash = await prisma.user.findUnique({ where: { mobile } });
      if (clash) return res.status(409).json({ error: 'That mobile number is already used by another account' });
    }
    const updated = await prisma.user.update({ where: { id: req.user.id }, data: { name, mobile, preferredLanguage }});
    return res.json({ user: publicUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: 'Profile update failed unexpectedly' });
  }
});

router.requireAuth = requireAuth;

// ---- Profile photo (FR-A6): one avatar per user, verified by content ----
const AVATAR_DIR = path.join(__dirname, 'uploads', 'avatars');
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

router.post('/profile/photo', requireAuth, (req, res) => {
  avatarUpload.single('photo')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Photo must be 5 MB or smaller' });
      return res.status(400).json({ error: 'Upload failed' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo file was sent (field name: photo)' });
      const ext = sniffImage(req.file.buffer);
      if (!ext) return res.status(400).json({ error: 'That file is not an image - we check the file content, not its name' });
      fs.mkdirSync(AVATAR_DIR, { recursive: true });
      for (const old of ['jpg', 'png', 'gif', 'webp']) {
        try { fs.unlinkSync(path.join(AVATAR_DIR, `${req.user.id}.${old}`)); } catch { /* no old file */ }
      }
      fs.writeFileSync(path.join(AVATAR_DIR, `${req.user.id}.${ext}`), req.file.buffer);
      const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: { profilePhotoUrl: `/uploads/avatars/${req.user.id}.${ext}` },
      });
      return res.json({ user: publicUser(updated) });
    } catch (e) {
      return res.status(500).json({ error: 'Photo upload failed unexpectedly' });
    }
  });
});
router.requireNotSuspended = requireNotSuspended;
module.exports = router;

