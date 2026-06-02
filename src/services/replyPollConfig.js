/**
 * Reply polling configuration (env overrides).
 *
 * REPLY_POLL_LIMIT=500              Max campaigns checked per account per run
 * REPLY_POLL_DAYS=90                Include sends up to N days ago
 * REPLY_POLL_STALE_CHECK_DAYS=14    Also include older sends not checked in N days
 * REPLY_POLL_MIN_HOURS_BETWEEN_CHECKS=2  Min hours before re-checking same campaign
 * REPLY_INBOX_SCAN_DAYS=2           Inbox-first: scan threads with activity in last N days
 */

export function getReplyPollConfig() {
  return {
    limit: Number(process.env.REPLY_POLL_LIMIT) || 500,
    pollDays: Number(process.env.REPLY_POLL_DAYS) || 90,
    staleCheckDays: Number(process.env.REPLY_POLL_STALE_CHECK_DAYS) || 14,
    minHoursBetweenChecks: Number(process.env.REPLY_POLL_MIN_HOURS_BETWEEN_CHECKS) || 2,
    inboxScanDays: Number(process.env.REPLY_INBOX_SCAN_DAYS) || 2,
  };
}

export function gmailAfterDate(daysBack) {
  const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}
