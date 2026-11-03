// One place that creates in-app notifications (FR-NT1). Email mirror
// is intentionally not wired: the demo must not depend on email.
const prisma = require('./prisma');

async function notify({ userId, type, title, body = '', listingId = null, claimId = null }) {
  if (!userId) return null;
  return prisma.notification.create({
    data: { userId, type, title, body, relatedListingId: listingId, relatedClaimId: claimId },
  });
}

module.exports = { notify };
