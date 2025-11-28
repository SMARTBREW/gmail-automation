import { Outbox } from '../models/Outbox.js';
import { AccountUsage } from '../models/AccountUsage.js';
import { sendEmail, getAccountDisplayName } from './gmailService.js';
import { createCampaignRecord, advanceTouchpoint } from './campaignDbService.js';
import { readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const DAILY_CAP_DEFAULT = parseInt(process.env.DAILY_CAP || '400', 10);
const MIN_INTERVAL_MS_DEFAULT = parseInt(process.env.MIN_INTERVAL_MS || '60000', 10);
const RESET_HOUR_LOCAL_DEFAULT = parseInt(process.env.RESET_HOUR_LOCAL || '0', 10); // midnight by default
const STUCK_JOB_MINUTES = parseInt(process.env.STUCK_JOB_MINUTES || '10', 10);
const JITTER_PCT = parseFloat(process.env.JITTER_PCT || '0.1'); // 10%
const SKIP_WEEKENDS = (process.env.SKIP_WEEKENDS || 'false') === 'true';
// Allowed daily send window for follow-ups (24h clock). Defaults: 11:00–17:00
const ALLOWED_WINDOW_START_HOUR = parseInt(process.env.ALLOWED_WINDOW_START_HOUR || '11', 10);
const ALLOWED_WINDOW_END_HOUR = parseInt(process.env.ALLOWED_WINDOW_END_HOUR || '17', 10);

// Cache config.json to avoid file I/O on every email (config rarely changes)
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 30 * 1000; // Cache for 30 seconds

function loadConfig() {
  const now = Date.now();
  // Return cached config if still fresh
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  try {
    const cfgPath = path.resolve(process.cwd(), 'config.json');
    configCache = JSON.parse(readFileSync(cfgPath, 'utf8'));
    configCacheTime = now;
    return configCache;
  } catch {
    configCache = { accounts: [] };
    configCacheTime = now;
    return configCache;
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

function addIntervalJitter(baseIntervalMs) {
  // Randomize interval: between 1 minute (60000ms) and 2 minutes (120000ms)
  // This prevents emails from sending at exactly the same interval
  // IGNORE baseIntervalMs - always use 1-2 minute jitter as specified
  const minIntervalMs = 60000; // 1 minute minimum
  const maxIntervalMs = 120000; // 2 minutes maximum
  // Return random interval between min and max
  return Math.floor(Math.random() * (maxIntervalMs - minIntervalMs + 1)) + minIntervalMs;
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
  // IMPORTANT: Use UTC hours to ensure consistent behavior regardless of server timezone
  const d = new Date(date);
  const start = new Date(d);
  start.setUTCHours(ALLOWED_WINDOW_START_HOUR, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(ALLOWED_WINDOW_END_HOUR, 0, 0, 0);
  if (ALLOWED_WINDOW_END_HOUR <= ALLOWED_WINDOW_START_HOUR) {
    // safety: if misconfigured, don't clamp
    return d;
  }
  if (d < start) {
    return start;
  }
  if (d >= end) {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(ALLOWED_WINDOW_START_HOUR, 0, 0, 0);
    return next;
  }
  return d; // already within window
}

function makeIdempotencyKey(obj) {
  const raw = JSON.stringify(obj);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function enqueueInitial({ from, to, subject, body, campaignName, recipientName, notBefore }) {
  // Normalize recipientName: extract just the name part if it contains comma (format: "Name, Dear Name")
  let normalizedRecipientName = recipientName || '';
  if (normalizedRecipientName && normalizedRecipientName.includes(',')) {
    normalizedRecipientName = normalizedRecipientName.split(',')[0].trim();
  }
  normalizedRecipientName = normalizedRecipientName ? normalizedRecipientName.trim() : '';
  
  const payload = { type: 'initial', from, to, subject, body, campaignName, recipientName: normalizedRecipientName, notBefore: notBefore ? new Date(notBefore) : undefined };
  const idempotencyKey = makeIdempotencyKey({ ...payload, k: 'v1' });
  // If notBefore is provided, use it directly (no jitter/weekend delays for batch loading)
  // If not provided, use current time (no future scheduling - let rate limiting handle delays)
  const nb = payload.notBefore ? new Date(payload.notBefore) : new Date();
  await Outbox.updateOne(
    { idempotencyKey },
    {
      $setOnInsert: {
        type: 'initial',
        from,
        to,
        subject,
        body, // CRITICAL: Include body in $setOnInsert so it's saved on first insert
        notBefore: nb,
        status: 'pending',
        idempotencyKey,
      },
      // Always update body and campaignRef fields (applies to both inserts and updates)
      // This ensures body is NEVER missing, even if document already exists
      $set: {
        body, // CRITICAL: Always update body, even if document exists (prevents missing body issue)
        'campaignRef.recipientName': normalizedRecipientName, // Already normalized above
        'campaignRef.campaignName': campaignName,
        'campaignRef.originalSubject': subject,
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

// Track last recovery time to avoid running on every poll
let lastRecoveryTime = 0;
const RECOVERY_INTERVAL_MS = 60 * 1000; // Run recovery every 60 seconds, not every poll

export async function recoverStuckJobs() {
  const now = Date.now();
  // Only run recovery if enough time has passed
  if ((now - lastRecoveryTime) < RECOVERY_INTERVAL_MS) {
    return; // Skip - too soon since last recovery
  }
  lastRecoveryTime = now;
  const threshold = new Date(now - STUCK_JOB_MINUTES * 60 * 1000);
  await Outbox.updateMany(
    { status: 'sending', claimedAt: { $lte: threshold } },
    { $set: { status: 'pending', claimedAt: null, workerId: null } }
  );
}

// Clean up HTML bodies from outbox records older than 12 hours (safety net for edge cases)
// Note: Bodies are deleted immediately after sending, this is just a backup cleanup
// IMPORTANT: Never remove bodies from pending emails - they may need to be retried!
// Using 12 hours ensures bodies stay available even with jitter/rate limiting delays
export async function cleanupOldBodies() {
  const hours = 12; // Remove bodies after 12 hours (safety net - gives plenty of time for jitter/rate limiting)
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const result = await Outbox.updateMany(
    { 
      createdAt: { $lte: cutoff },
      body: { $exists: true, $ne: null },
      status: { $in: ['sent', 'failed'] } // Only remove bodies from sent/failed emails, NEVER from pending
    },
    { $unset: { body: '' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🧹 Cleaned up ${result.modifiedCount} old outbox bodies (safety net - 12hr threshold)`);
  }
  return result.modifiedCount;
}

// Cache account usage to avoid repeated DB queries for the same account
const usageCache = new Map(); // email -> { usage, lastChecked }
const USAGE_CACHE_TTL_MS = 5 * 1000; // Cache usage for 5 seconds

async function getCachedUsage(email) {
  const now = Date.now();
  const cached = usageCache.get(email);
  if (cached && (now - cached.lastChecked) < USAGE_CACHE_TTL_MS) {
    return cached.usage;
  }
  const usage = await getOrInitUsage(email);
  usageCache.set(email, { usage, lastChecked: now });
  return usage;
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
  // Use consistent timestamp throughout the batch (permanent optimization)
  const now = new Date();
  const nowMs = now.getTime(); // Use milliseconds for rate limit checks
  let processed = 0;
  // Track usage per account in this batch to avoid repeated DB queries
  const accountUsageMap = new Map();
  
  for (let i = 0; i < 50; i++) {
    const job = await claimJobAtomically(now);
    if (!job) break;
    try {
      // Use cached usage to avoid repeated DB queries for same account
      let usage = accountUsageMap.get(job.from);
      if (!usage) {
        usage = await getCachedUsage(job.from);
        accountUsageMap.set(job.from, usage);
      }
      const limits = getAccountLimits(job.from);
      // Daily cap check
      if (usage.sentToday >= limits.dailyCap) {
        // spill to next reset
        await Outbox.findByIdAndUpdate(job._id, { $set: { notBefore: usage.resetAt, status: 'pending', claimedAt: null, workerId: null } });
        continue;
      }
      // Min interval check - use consistent timestamp (permanent optimization)
      const minIntervalMs = limits.minIntervalMs;
      if (usage.lastSentAt && nowMs - new Date(usage.lastSentAt).getTime() < minIntervalMs) {
        // Reschedule with random jitter: between 1 minute and 2 minutes from now
        // This prevents emails from sending at exactly the same interval
        const intervalWithJitter = addIntervalJitter(); // Always 1-2 minutes, ignore minIntervalMs
        const nextAt = new Date(nowMs + intervalWithJitter);
        await Outbox.findByIdAndUpdate(job._id, { $set: { notBefore: nextAt, status: 'pending', claimedAt: null, workerId: null } });
        continue;
      }
      // For follow-ups: check if replied BEFORE sending (not just when queuing)
      if (job.type === 'followup' && job.campaignRef?.campaignId) {
        const { checkThreadForReply } = await import('./gmailService.js');
        const { Campaign } = await import('../models/Campaign.js');
        const campaign = await Campaign.findById(job.campaignRef.campaignId).lean();
        if (campaign) {
          const hasReply = await checkThreadForReply({
            fromEmail: job.from,
            threadId: job.headers?.threadId || campaign.threadId,
            recipientEmail: job.to,
          });
          if (hasReply) {
            // Mark campaign as replied and skip sending
            await Campaign.findByIdAndUpdate(job.campaignRef.campaignId, { replied: true });
            await Outbox.findByIdAndUpdate(job._id, { 
              $set: { status: 'sent' }, 
              $unset: { body: '' } 
            });
            continue; // Skip this email - they already replied
          }
        }
      }
      
      // Regenerate body from template if missing (for both initial and follow-up emails)
      let emailBody = job.body;
      if (!emailBody && job.campaignRef?.campaignName) {
        try {
          const { getTemplateForCampaign } = await import('./campaignDbService.js');
          const tpl = await getTemplateForCampaign(job.campaignRef.campaignName);
          
          if (!tpl) {
            throw new Error(`Template not found for campaign: ${job.campaignRef.campaignName}`);
          }
          
          if (job.type === 'initial') {
            // For initial emails, use touchpoint 1 (randomly select from variants 1, 1a-1i)
            const templatesMap = tpl.templates instanceof Map 
              ? Object.fromEntries(tpl.templates) 
              : tpl.templates || {};
            
            if (!templatesMap || Object.keys(templatesMap).length === 0) {
              throw new Error(`No templates found in campaign: ${job.campaignRef.campaignName}`);
            }
            
            const firstTouchKeys = Object.keys(templatesMap)
              .filter((key) => key.toString().toLowerCase().startsWith('1'))
              .sort();
            
            if (firstTouchKeys.length === 0) {
              throw new Error(`No touchpoint 1 templates found in campaign: ${job.campaignRef.campaignName}`);
            }
            
            // Randomly select a variant (same as batch script)
            const chosenKey = firstTouchKeys[Math.floor(Math.random() * firstTouchKeys.length)];
            const templateBody = templatesMap[chosenKey];
            
            if (!templateBody) {
              throw new Error(`Template body is empty for key: ${chosenKey}`);
            }
            
            let recipientName = job.campaignRef?.recipientName || '';
            // Extract just the name part if recipientName contains comma (format: "Name, Dear Name")
            if (recipientName && recipientName.includes(',')) {
              recipientName = recipientName.split(',')[0].trim();
            }
            // Normalize: trim whitespace and ensure it's not empty
            recipientName = recipientName ? recipientName.trim() : '';
            emailBody = templateBody;
            if (recipientName) {
              // Use case-insensitive replace to handle any casing issues
              // Replace ALL occurrences of {recipientName} with the actual name
              emailBody = emailBody.replace(/{recipientName}/gi, recipientName);
            } else {
              // If no name, replace "Dear {recipientName}," with "Hello,"
              emailBody = emailBody.replace(/Dear\s+{recipientName},/gi, 'Hello,');
              // Remove any remaining {recipientName} placeholders
              emailBody = emailBody.replace(/{recipientName}/gi, '');
            }
            const senderName = getAccountDisplayName(job.from) || '';
            emailBody = emailBody.replace(/{senderName}/g, senderName);
            
            // CRITICAL: Save the regenerated body back to the database so it doesn't need to be regenerated again
            await Outbox.findByIdAndUpdate(job._id, { 
              $set: { body: emailBody },
              $unset: { lastError: '' }
            });
          } else if (job.type === 'followup' && job.campaignRef?.campaignId) {
            // For follow-ups, use the campaign's current touchpoint
            const { Campaign } = await import('../models/Campaign.js');
            const campaign = await Campaign.findById(job.campaignRef.campaignId).lean();
            if (campaign) {
              const nextTouch = Math.min(7, (campaign.touchpoint || 1) + 1);
              const templatesMap = tpl.templates instanceof Map 
                ? Object.fromEntries(tpl.templates) 
                : tpl.templates || {};
              const templateBody = templatesMap[nextTouch];
              if (templateBody) {
                // Generate body like enqueue-followups.js does
                const recipientName = campaign.recipientName || '';
                emailBody = templateBody;
                if (recipientName) {
                  emailBody = emailBody.replace(/{recipientName}/g, recipientName);
                } else {
                  emailBody = emailBody.replace(/Dear {recipientName},/g, 'Hello,').replace(/{recipientName}/g, '');
                }
                const senderName = campaign.displayName || getAccountDisplayName(job.from) || '';
                emailBody = emailBody.replace(/{senderName}/g, senderName);
                
                // CRITICAL: Save the regenerated body back to the database so it doesn't need to be regenerated again
                await Outbox.findByIdAndUpdate(job._id, { 
                  $set: { body: emailBody },
                  $unset: { lastError: '' }
                });
              }
            }
          }
        } catch (regenError) {
          // Log the regeneration error for debugging
          console.error(`Failed to regenerate body for job ${job._id} (${job.to}):`, regenError.message);
          // Don't throw here - let it fall through to the error below with more context
        }
      }
      
      // Body is required for sending
      if (!emailBody) {
        const errorMsg = job.campaignRef?.campaignName 
          ? `Missing body for outbox job ${job._id} and could not regenerate from template (campaign: ${job.campaignRef.campaignName})`
          : `Missing body for outbox job ${job._id} and could not regenerate (no campaign name)`;
        throw new Error(errorMsg);
      }
      const headers = job.headers || {};
      const res = await sendEmail(job.from, job.to, job.subject, emailBody, headers);
      
      // Update usage immediately (in memory) for next email's rate limit check
      // Use consistent timestamp (permanent optimization)
      usage.sentToday += 1;
      usage.lastSentAt = now; // Use batch timestamp for consistency
      if (!usage.resetAt || usage.resetAt <= now) {
        usage.resetAt = computeNextResetAt(limits.resetHourLocal);
      }
      // Update cache immediately so next email can use updated usage
      usageCache.set(job.from, { usage, lastChecked: nowMs });
      accountUsageMap.set(job.from, usage);
      
      // Update outbox status immediately (must complete to mark job as sent)
      // Delete body to save database space
      await Outbox.findByIdAndUpdate(job._id, { 
        $set: { status: 'sent' }, 
        $unset: { body: '' } 
      });
      
      // Save usage in background (fire and forget - already updated in memory/cache)
      // This doesn't block the next email from processing
      usage.save().catch(err => {
        console.error(`Failed to save usage for ${job.from}:`, err.message);
      });
      
      // campaign bookkeeping - fire and forget to not block next email
      // These operations are not critical for the next email to send
      if (job.type === 'initial') {
        const displayName = getAccountDisplayName(job.from);
        // Don't await - let it run in background to speed up processing
        createCampaignRecord({
          campaignName: job.campaignRef?.campaignName,
          to: job.to,
          from: job.from,
          displayName,
          subject: job.campaignRef?.originalSubject || job.subject,
          recipientName: job.campaignRef?.recipientName || '', // Ensure it's always passed
          threadId: res.threadId,
          messageId: res.messageId,
          internetMessageId: res.internetMessageId,
        }).catch(err => {
          console.error(`Failed to create campaign record for ${job.to}:`, err.message);
        });
      } else if (job.type === 'followup' && job.campaignRef?.campaignId) {
        // Don't await - let it run in background
        // Note: newBody is not stored (saves DB space), but we pass it for logging if needed
        advanceTouchpoint({
          campaignId: job.campaignRef.campaignId,
          newBody: emailBody, // Use the regenerated body
          newMessageId: res.messageId,
          threadId: res.threadId,
          internetMessageId: res.internetMessageId,
        }).catch(err => {
          console.error(`Failed to advance touchpoint for campaign ${job.campaignRef.campaignId}:`, err.message);
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


