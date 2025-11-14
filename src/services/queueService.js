import { Outbox } from '../models/Outbox.js';
import { AccountUsage } from '../models/AccountUsage.js';
import { sendEmail, getAccountDisplayName } from './gmailService.js';
import { createCampaignRecord, advanceTouchpoint } from './campaignDbService.js';
import { readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const DAILY_CAP_DEFAULT = parseInt(process.env.DAILY_CAP || '400', 10);
const MIN_INTERVAL_MS_DEFAULT = parseInt(process.env.MIN_INTERVAL_MS || '3000', 10);
const RESET_HOUR_LOCAL_DEFAULT = parseInt(process.env.RESET_HOUR_LOCAL || '0', 10); // midnight by default
const STUCK_JOB_MINUTES = parseInt(process.env.STUCK_JOB_MINUTES || '10', 10);
const JITTER_PCT = parseFloat(process.env.JITTER_PCT || '0.1'); // 10%
const SKIP_WEEKENDS = (process.env.SKIP_WEEKENDS || 'false') === 'true';
// Allowed daily send window for follow-ups (24h clock). Defaults: 11:00–17:00
const ALLOWED_WINDOW_START_HOUR = parseInt(process.env.ALLOWED_WINDOW_START_HOUR || '11', 10);
const ALLOWED_WINDOW_END_HOUR = parseInt(process.env.ALLOWED_WINDOW_END_HOUR || '17', 10);

function loadConfig() {
  try {
    const cfgPath = path.resolve(process.cwd(), 'config.json');
    return JSON.parse(readFileSync(cfgPath, 'utf8'));
  } catch {
    return { accounts: [] };
  }
}

function getAccountLimits(email) {
  const cfg = loadConfig();
  const acct = (cfg.accounts || []).find(a => a.email === email) || {};
  return {
    dailyCap: acct.dailyCap ?? DAILY_CAP_DEFAULT,
    minIntervalMs: acct.minIntervalMs ?? MIN_INTERVAL_MS_DEFAULT,
    resetHourLocal: acct.resetHourLocal ?? RESET_HOUR_LOCAL_DEFAULT,
  };
}

function computeNextResetAt(resetHourLocal) {
  const now = new Date();
  const reset = new Date(now);
  reset.setHours(resetHourLocal, 0, 0, 0);
  if (reset <= now) reset.setDate(reset.getDate() + 1); // next day
  return reset;
}

async function getOrInitUsage(email) {
  let doc = await AccountUsage.findOne({ email });
  const now = new Date();
  if (!doc) {
    const limits = getAccountLimits(email);
    doc = await AccountUsage.create({
      email,
      sentToday: 0,
      lastSentAt: null,
      resetAt: computeNextResetAt(limits.resetHourLocal),
    });
  } else if (doc.resetAt && doc.resetAt <= now) {
    doc.sentToday = 0;
    const limits = getAccountLimits(email);
    doc.resetAt = computeNextResetAt(limits.resetHourLocal);
    await doc.save();
  }
  return doc;
}

function addJitter(date, pct = JITTER_PCT) {
  const ms = date.getTime();
  const delta = Math.floor((Math.random() * 2 - 1) * pct * 60 * 1000);
  return new Date(ms + delta);
}

function ensureWeekday(date) {
  if (!SKIP_WEEKENDS) return date;
  const d = new Date(date);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1);
  if (day === 6) d.setDate(d.getDate() + 2);
  return d;
}

function clampToAllowedWindow(date) {
  // If the time is outside the allowed daily window, move to the next start
  const d = new Date(date);
  const start = new Date(d);
  start.setHours(ALLOWED_WINDOW_START_HOUR, 0, 0, 0);
  const end = new Date(d);
  end.setHours(ALLOWED_WINDOW_END_HOUR, 0, 0, 0);
  if (ALLOWED_WINDOW_END_HOUR <= ALLOWED_WINDOW_START_HOUR) {
    // safety: if misconfigured, don't clamp
    return d;
  }
  if (d < start) {
    return start;
  }
  if (d >= end) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    next.setHours(ALLOWED_WINDOW_START_HOUR, 0, 0, 0);
    return next;
  }
  return d; // already within window
}

function makeIdempotencyKey(obj) {
  const raw = JSON.stringify(obj);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function enqueueInitial({ from, to, subject, body, campaignName, recipientName, notBefore }) {
  const payload = { type: 'initial', from, to, subject, body, campaignName, recipientName, notBefore: notBefore ? new Date(notBefore) : undefined };
  const idempotencyKey = makeIdempotencyKey({ ...payload, k: 'v1' });
  const nb = payload.notBefore ? ensureWeekday(new Date(payload.notBefore)) : ensureWeekday(addJitter(new Date()));
  await Outbox.updateOne(
    { idempotencyKey },
    {
      $setOnInsert: {
        type: 'initial',
        from, to, subject, body,
        campaignRef: { campaignName, originalSubject: subject, recipientName },
        notBefore: nb,
        status: 'pending',
        idempotencyKey,
      },
    },
    { upsert: true }
  );
}

export async function enqueueFollowup({ from, to, subject, body, headers, campaignId, originalSubject }) {
  const payload = { type: 'followup', from, to, subject, body, headers, campaignId, originalSubject };
  const idempotencyKey = makeIdempotencyKey({ ...payload, k: 'v1' });
  // For follow-ups, clamp sending to the allowed daily window (e.g., 11:00–17:00)
  let notBefore = addJitter(new Date());
  notBefore = clampToAllowedWindow(notBefore);
  notBefore = ensureWeekday(notBefore);
  await Outbox.updateOne(
    { idempotencyKey },
    {
      $setOnInsert: {
        type: 'followup',
        from, to, subject, body,
        headers: headers || {},
        campaignRef: { campaignId, originalSubject },
        notBefore,
        status: 'pending',
        idempotencyKey,
      },
    },
    { upsert: true }
  );
}

export async function recoverStuckJobs() {
  const threshold = new Date(Date.now() - STUCK_JOB_MINUTES * 60 * 1000);
  await Outbox.updateMany(
    { status: 'sending', claimedAt: { $lte: threshold } },
    { $set: { status: 'pending', claimedAt: null, workerId: null } }
  );
}

// Clean up HTML bodies from outbox records older than 5 minutes (safety net for edge cases)
// Note: Bodies are deleted immediately after sending, this is just a backup cleanup
export async function cleanupOldBodies() {
  const minutes = 5; // Remove bodies after 5 minutes (safety net)
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const result = await Outbox.updateMany(
    { 
      createdAt: { $lte: cutoff },
      body: { $exists: true, $ne: null },
      status: { $ne: 'sending' } // Don't delete bodies from jobs currently being sent
    },
    { $unset: { body: '' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🧹 Cleaned up ${result.modifiedCount} old outbox bodies (safety net)`);
  }
  return result.modifiedCount;
}

async function claimJobAtomically(now) {
  return await Outbox.findOneAndUpdate(
    { status: 'pending', notBefore: { $lte: now } },
    { $set: { status: 'sending', claimedAt: now, workerId: String(process.pid) } },
    { sort: { notBefore: 1, createdAt: 1 }, new: true }
  ).lean();
}

function parseRetryAfterMs(err) {
  const hdr = err?.response?.headers?.['retry-after'] || err?.response?.headers?.['Retry-After'];
  if (!hdr) return null;
  const s = parseInt(hdr, 10);
  if (!isNaN(s)) return s * 1000;
  return null;
}

function backoffMs(attempts) {
  const base = 15 * 60 * 1000; // 15m
  const ms = base * Math.pow(2, Math.min(attempts, 4)); // up to ~4h
  return Math.min(ms, 6 * 60 * 60 * 1000); // max 6h
}

export async function processOutboxOnce() {
  await recoverStuckJobs();
  const now = new Date();
  let processed = 0;
  for (let i = 0; i < 50; i++) {
    const job = await claimJobAtomically(now);
    if (!job) break;
    try {
      const usage = await getOrInitUsage(job.from);
      const limits = getAccountLimits(job.from);
      // Daily cap check
      if (usage.sentToday >= limits.dailyCap) {
        // spill to next reset
        await Outbox.findByIdAndUpdate(job._id, { $set: { notBefore: usage.resetAt, status: 'pending', claimedAt: null, workerId: null } });
        continue;
      }
      // Min interval check
      const minIntervalMs = limits.minIntervalMs;
      if (usage.lastSentAt && Date.now() - new Date(usage.lastSentAt).getTime() < minIntervalMs) {
        // Reschedule for exactly minIntervalMs later (no jitter to avoid unnecessary delays)
        const nextAt = new Date(new Date(usage.lastSentAt).getTime() + minIntervalMs);
        await Outbox.findByIdAndUpdate(job._id, { $set: { notBefore: nextAt, status: 'pending', claimedAt: null, workerId: null } });
        continue;
      }
      // Body is required for sending (but optional in schema after deletion)
      if (!job.body) {
        throw new Error(`Missing body for outbox job ${job._id}`);
      }
      const headers = job.headers || {};
      const res = await sendEmail(job.from, job.to, job.subject, job.body, headers);
      
      // Delete body IMMEDIATELY after successful send to save database space
      // Do this first before other operations to ensure body is removed even if later steps fail
      await Outbox.findByIdAndUpdate(job._id, { 
        $set: { status: 'sent' }, 
        $unset: { body: '' } 
      });
      
      // success: update usage
      usage.sentToday += 1;
      usage.lastSentAt = new Date();
      if (!usage.resetAt || usage.resetAt <= new Date()) {
        usage.resetAt = computeNextResetAt(limits.resetHourLocal);
      }
      await usage.save();
      // campaign bookkeeping
      if (job.type === 'initial') {
        const displayName = getAccountDisplayName(job.from);
        // Always pass recipientName (even if empty) to ensure it's saved for follow-ups
        await createCampaignRecord({
          campaignName: job.campaignRef?.campaignName,
          to: job.to,
          from: job.from,
          displayName,
          subject: job.campaignRef?.originalSubject || job.subject,
          recipientName: job.campaignRef?.recipientName || '', // Ensure it's always passed
          threadId: res.threadId,
          messageId: res.messageId,
          internetMessageId: res.internetMessageId,
        });
      } else if (job.type === 'followup' && job.campaignRef?.campaignId) {
        await advanceTouchpoint({
          campaignId: job.campaignRef.campaignId,
          newBody: job.body,
          newMessageId: res.messageId,
          threadId: res.threadId,
          internetMessageId: res.internetMessageId,
        });
      }
      processed += 1;
    } catch (err) {
      const attempts = (job.attempts || 0) + 1;
      const retryHdrMs = parseRetryAfterMs(err);
      const nextTry = new Date(Date.now() + (retryHdrMs ?? backoffMs(attempts)));
      await Outbox.findByIdAndUpdate(job._id, {
        $set: { status: 'pending', lastError: err?.message || String(err), notBefore: nextTry, attempts },
        $unset: { claimedAt: '', workerId: '' },
      });
    }
  }
  return { processed };
}


