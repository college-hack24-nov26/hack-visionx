const express = require('express');
const prisma = require('./prisma');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/invites/mine - my invite code (my user id) + how many people joined through me.
// Defined BEFORE /:code so the word "mine" is never treated as a code.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const invitedCount = await prisma.user.count({ where: { invitedById: req.user.id } });
    return res.json({ code: req.user.id, invitedCount });
  } catch (err) {
    return res.status(500).json({ error: 'Could not load your invite details' });
  }
});

// GET /api/invites/:code - public. The code IS a user id.
// Answers with the inviter's NAME only - never any contact details.
router.get('/:code', async (req, res) => {
  try {
    const inviter = await prisma.user.findUnique({
      where: { id: req.params.code },
      select: { name: true },
    });
    if (!inviter) return res.status(404).json({ error: 'Invite not found' });
    return res.json({ inviterName: inviter.name });
  } catch (err) {
    return res.status(500).json({ error: 'Could not check that invite' });
  }
});

module.exports = router;
