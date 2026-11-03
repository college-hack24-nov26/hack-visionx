// Creates ONLY the main admin account from MAIN_ADMIN_* env values
// (PRD clean start: the delivered system begins with this one account).
// Safe to run repeatedly: an existing admin gets its password re-applied
// from the env, so the demo login never gets locked out.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

async function main() {
  const email = (process.env.MAIN_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.MAIN_ADMIN_PASSWORD || '';
  const name = process.env.MAIN_ADMIN_NAME || 'Main Admin';
  const mobile = process.env.MAIN_ADMIN_MOBILE || '9000000000';
  if (!email || !password) {
    console.error('MAIN_ADMIN_EMAIL and MAIN_ADMIN_PASSWORD must be set in server/.env');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, accountType: 'ADMIN', isSuspended: false },
    });
    console.log(`Main admin updated: ${email}`);
  } else {
    await prisma.user.create({
      data: { name, email, mobile, passwordHash, accountType: 'ADMIN', activeRole: 'CLAIMER' },
    });
    console.log(`Main admin created: ${email}`);
  }
}

main()
  .catch((e) => { console.error('Seed failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
