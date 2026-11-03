// Audit log helper: records admin actions in the AuditLog table.
// Never throws — a failed audit write must not break the admin action itself.
const prisma = require('./prisma');

async function logAudit({ actorId, actorEmail, action, targetType, targetId, detail }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorEmail: actorEmail || 'unknown',
        action,
        targetType,
        targetId: targetId || null,
        detail: detail || null,
      },
    });
  } catch (err) {
    console.error('audit log write failed:', err.message);
  }
}

module.exports = { logAudit };
