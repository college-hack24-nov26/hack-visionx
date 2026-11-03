// One shared Prisma (database) connection for the whole server.
const { PrismaClient } = require('@prisma/client');

module.exports = new PrismaClient();
