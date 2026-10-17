import prisma from '../db/prisma';

export interface AuditEventInput {
  event: string;
  properties?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
}

/**
 * Records an audit event for sensitive administrative actions.
 * Fail-open: never blocks the primary request if audit logging fails.
 */
export async function auditAdmin(
  input: AuditEventInput
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        event: input.event,
        properties: JSON.stringify(input.properties ?? {}),
        userId: input.userId,
        sessionId: input.sessionId ?? 'system',
      },
    });
  } catch (error) {
    // Best-effort audit logging; do not fail the primary action.
    // eslint-disable-next-line no-console
    console.error('Audit log failed:', error);
  }
}
