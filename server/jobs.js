// Background jobs (FR-E1/E2): every 60 seconds, expire listings whose
// deadline has passed (and their confirmed claims), and send the
// once-per-threshold near-deadline alerts. Also runs once at startup.
const prisma = require('./prisma');
const { notify } = require('./notify');

const LIVE_FAMILY = ['LIVE', 'PARTIALLY_CLAIMED', 'FULLY_CLAIMED'];

async function expireListings(now) {
  const expiring = await prisma.listing.findMany({
    where: { status: { in: LIVE_FAMILY }, deadline: { lte: now } },
    include: { claims: { where: { status: 'CONFIRMED' } } },
  });
  for (const listing of expiring) {
    await prisma.$transaction([
      prisma.listing.update({ where: { id: listing.id }, data: { status: 'EXPIRED' } }),
      prisma.claim.updateMany({
        where: { listingId: listing.id, status: 'CONFIRMED' },
        data: { status: 'EXPIRED', codeEncrypted: null },
      }),
    ]);
    for (const claim of listing.claims) {
      await notify({
        userId: claim.claimerId, type: 'CLAIM_EXPIRED',
        title: `Expired before pickup: ${listing.foodName}`,
        body: 'The collection deadline passed, so this claim has expired.',
        listingId: listing.id, claimId: claim.id,
      });
    }
  }
}

async function nearDeadlineAlerts(now) {
  for (const threshold of [60, 30]) {
    const until = new Date(now.getTime() + threshold * 60000);
    const listings = await prisma.listing.findMany({
      where: { status: { in: LIVE_FAMILY }, deadline: { gt: now, lte: until } },
      include: { claims: { where: { status: 'CONFIRMED' } } },
    });
    for (const listing of listings) {
      const sent = new Set(listing.deadlineAlertsSent || []);
      const audiences = [
        { key: `${threshold}:DONOR`, userIds: [listing.providerId] },
        { key: `${threshold}:CLAIMERS`, userIds: listing.claims.map((c) => c.claimerId) },
      ];
      let changed = false;
      for (const a of audiences) {
        if (sent.has(a.key) || a.userIds.length === 0) continue;
        for (const userId of a.userIds) {
          await notify({
            userId, type: 'NEAR_DEADLINE',
            title: `${threshold} minutes left: ${listing.foodName}`,
            body: `The collection deadline for ${listing.foodName} is coming up.`,
            listingId: listing.id,
          });
        }
        sent.add(a.key);
        changed = true;
      }
      if (changed) {
        await prisma.listing.update({ where: { id: listing.id }, data: { deadlineAlertsSent: [...sent] } });
      }
    }
  }
}

async function tick() {
  try {
    const now = new Date();
    await expireListings(now);
    await nearDeadlineAlerts(now);
  } catch (e) {
    console.error('Jobs tick failed:', e.message);
  }
}

function startJobs() {
  tick();
  setInterval(tick, 60 * 1000);
}

module.exports = { startJobs };
