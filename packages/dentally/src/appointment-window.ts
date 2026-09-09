/** Dentally `/appointments` returns 0 rows unless `after`/`before` are set (confirmed live). */

export const APPOINTMENT_SYNC_LOOKBACK_MONTHS = 24;
export const APPOINTMENT_SYNC_LOOKAHEAD_MONTHS = 12;

export function appointmentSyncDateParams(now = new Date()): { after: string; before: string } {
  const after = new Date(now);
  after.setMonth(after.getMonth() - APPOINTMENT_SYNC_LOOKBACK_MONTHS);
  const before = new Date(now);
  before.setMonth(before.getMonth() + APPOINTMENT_SYNC_LOOKAHEAD_MONTHS);
  return {
    after: after.toISOString().slice(0, 10),
    before: before.toISOString().slice(0, 10),
  };
}
