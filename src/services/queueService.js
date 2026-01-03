import { Outbox } from '../models/Outbox.js';
import { AccountUsage } from '../models/AccountUsage.js';
import { sendEmail, getAccountDisplayName } from './gmailService.js';
import { createCampaignRecord, advanceTouchpoint } from './campaignDbService.js';
import { readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const DAILY_CAP_DEFAULT = parseInt(process.env.DAILY_CAP || '400', 10);
const MIN_INTERVAL_MS_DEFAULT = parseInt(process.env.MIN_INTERVAL_MS || '240000', 10);
const MAX_INTERVAL_MS_DEFAULT = parseInt(process.env.MAX_INTERVAL_MS || '360000', 10);
const RESET_HOUR_LOCAL_DEFAULT = parseInt(process.env.RESET_HOUR_LOCAL || '0', 10); 
const STUCK_JOB_MINUTES = parseInt(process.env.STUCK_JOB_MINUTES || '10', 10);
const JITTER_PCT = parseFloat(process.env.JITTER_PCT || '0.1'); 
const SKIP_WEEKENDS = (process.env.SKIP_WEEKENDS || 'false') === 'true';
// Sending window disabled - emails can send anytime (0-23 means all day)
const ALLOWED_WINDOW_START_HOUR = parseInt(process.env.ALLOWED_WINDOW_START_HOUR || '0', 10);
const ALLOWED_WINDOW_END_HOUR = parseInt(process.env.ALLOWED_WINDOW_END_HOUR || '23', 10);
// Removed global follow-up limit - each account now uses its own dailyCap independently

let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 30 * 1000;

function loadConfig() {
  const now = Date.now();
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
    maxIntervalMs: acct.maxIntervalMs ?? MAX_INTERVAL_MS_DEFAULT,
    resetHourLocal: acct.resetHourLocal ?? RESET_HOUR_LOCAL_DEFAULT,
  };
}

function computeNextResetAt(resetHourLocal) {
  const now = new Date();
  const reset = new Date(now);
  reset.setHours(resetHourLocal, 0, 0, 0);
  if (reset <= now) reset.setDate(reset.getDate() + 1);
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

function addIntervalJitter(limits) {
  // Random gap between minIntervalMs and maxIntervalMs from account config
  const minIntervalMs = limits?.minIntervalMs ?? MIN_INTERVAL_MS_DEFAULT;
  const maxIntervalMs = limits?.maxIntervalMs ?? MAX_INTERVAL_MS_DEFAULT;
  // Ensure max is at least equal to min
  const max = Math.max(maxIntervalMs, minIntervalMs);
  return Math.floor(Math.random() * (max - minIntervalMs + 1)) + minIntervalMs;
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
  const d = new Date(date);
  const start = new Date(d);
  start.setUTCHours(ALLOWED_WINDOW_START_HOUR, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(ALLOWED_WINDOW_END_HOUR, 0, 0, 0);
  if (ALLOWED_WINDOW_END_HOUR <= ALLOWED_WINDOW_START_HOUR) {
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
  return d;
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
  
  // CRITICAL: Validate body is not empty
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    throw new Error(`Cannot enqueue email to ${to}: body is empty or invalid`);
  }
  
  // OPTIONAL: Validate email is in contacts.json (only if contacts.json exists)
  // This prevents queuing emails that aren't in the current batch
  // But we don't fail if contacts.json doesn't exist (allows manual queuing)
  try {
    const contactsPath = path.resolve(process.cwd(), 'batches', 'contacts.json');
    const contacts = JSON.parse(readFileSync(contactsPath, 'utf8'));
    const contactEmails = contacts.map(c => (c.email || '').toLowerCase().trim());
    const jobEmail = (to || '').toLowerCase().trim();
    
    if (contactEmails.length > 0 && !contactEmails.includes(jobEmail)) {
      // Only warn, don't fail - allows flexibility
      console.warn(`⚠️  Warning: ${to} is not in contacts.json - queuing anyway (idempotency will prevent duplicates)`);
    }
  } catch (err) {
    // contacts.json doesn't exist or can't be read - that's okay, continue
  }
  
  // Idempotency key should ONLY include stable fields (from, to, type, campaignName)
  // NOT body, subject, recipientName, or notBefore - these can change but it's still the same email
  const idempotencyPayload = { type: 'initial', from, to, campaignName, k: 'v1' };
  const idempotencyKey = makeIdempotencyKey(idempotencyPayload);
  // If notBefore is provided, use it directly (no jitter/weekend delays for batch loading)
  // If not provided, use current time (no future scheduling - let rate limiting handle delays)
  const nb = notBefore ? new Date(notBefore) : new Date();
  
  // Build update object - ensure campaignRef is properly initialized
  const setFields = {
    body, // Always update body
    // Use dot notation for nested fields - Mongoose handles this correctly when schema is defined
    'campaignRef.recipientName': normalizedRecipientName,
    'campaignRef.campaignName': campaignName,
    'campaignRef.originalSubject': subject,
  };
  
  // Use Mongoose updateOne with proper nested field handling
  // The schema now includes recipientName in campaignRef, so dot notation updates work correctly
  // NOTE: campaignRef must NOT be in $setOnInsert when using dot notation in $set (MongoDB conflict)
  const result = await Outbox.updateOne(
    { idempotencyKey },
    {
      $setOnInsert: {
        type: 'initial',
        from,
        to,
        subject,
        notBefore: nb,
        status: 'pending',
        idempotencyKey,
      },
      // Always update body and campaignRef fields (applies to both inserts and updates)
      // Dot notation works correctly now that recipientName is in the schema
      // For new documents, MongoDB will create the nested structure automatically
      $set: setFields,
    },
    { upsert: true, runValidators: true }
  );
  
  // VALIDATION: Verify the data was saved correctly (prevent silent failures)
  if (result.upsertedCount > 0 || result.modifiedCount > 0) {
    const saved = await Outbox.findOne({ idempotencyKey }).lean();
    if (!saved) {
      throw new Error(`Failed to save email to ${to} - document not found after upsert`);
    }
    if (!saved.body || saved.body.trim().length === 0) {
      throw new Error(`Failed to save email body to ${to} - body is empty after save`);
    }
    if (!saved.campaignRef?.recipientName && normalizedRecipientName) {
      // Only warn if we expected a recipientName but it's missing
      console.warn(`⚠️  Warning: recipientName not saved for ${to} (expected: "${normalizedRecipientName}")`);
    }
  }
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

// Clean up HTML bodies from outbox records older than 7 days (safety net for edge cases)
// IMPORTANT: Never remove bodies from pending/sending emails - they may need to be retried!
// Keep bodies for 7 days to allow for retries, debugging, and edge cases
// Only clean up bodies from sent/failed emails that are older than 7 days
export async function cleanupOldBodies() {
  const days = 7; // Keep bodies for 7 days (much longer to prevent regeneration issues)
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await Outbox.updateMany(
    { 
      createdAt: { $lte: cutoff },
      body: { $exists: true, $ne: null },
      status: { $in: ['sent', 'failed'] }, // Only remove bodies from sent/failed emails
      // CRITICAL: NEVER delete from pending or sending - they need bodies for retries!
    },
    { $unset: { body: '' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🧹 Cleaned up ${result.modifiedCount} old outbox bodies (7 day threshold, sent/failed only)`);
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
  // Track which accounts have sent in this batch to prevent multiple sends per account
  const accountsSentThisBatch = new Set();
  
  // Removed global follow-up limit - each account uses its own dailyCap independently
  
  for (let i = 0; i < 50; i++) {
    const job = await claimJobAtomically(now);
    if (!job) break;
    try {
      // CRITICAL: Only allow one email per account per batch cycle to enforce minIntervalMs
      // This prevents multiple emails from the same account being sent in the same second
      if (accountsSentThisBatch.has(job.from)) {
        // This account already sent in this batch - reschedule to respect minIntervalMs
        const limits = getAccountLimits(job.from);
        const intervalWithJitter = addIntervalJitter(limits); // Random between min-max
        const nextAt = new Date(nowMs + intervalWithJitter);
        await Outbox.findByIdAndUpdate(job._id, { 
          $set: { notBefore: nextAt, status: 'pending' },
          $unset: { claimedAt: '', workerId: '' }
        });
        continue;
      }
      
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
        // Reschedule with random jitter: between minIntervalMs and maxIntervalMs from now
        // This prevents emails from sending at exactly the same interval
        const intervalWithJitter = addIntervalJitter(limits); // Random between min-max
        const nextAt = new Date(nowMs + intervalWithJitter);
        await Outbox.findByIdAndUpdate(job._id, { $set: { notBefore: nextAt, status: 'pending', claimedAt: null, workerId: null } });
        continue;
      }
      
      // Removed global follow-up limit - each account now uses its own dailyCap independently
      // Follow-ups are subject to the same dailyCap as initial emails per account
      
      // For follow-ups: check if replied BEFORE sending
      // (Reply detection is handled by bin/poll-replies.js cron job, but we check here as final safety net)
      if (job.type === 'followup' && job.campaignRef?.campaignId) {
        const { Campaign } = await import('../models/Campaign.js');
        const campaign = await Campaign.findById(job.campaignRef.campaignId).lean();
        
        // If campaign was deleted, cancel the follow-up
        if (!campaign) {
          console.warn(`⚠️  Campaign ${job.campaignRef.campaignId} was deleted - cancelling follow-up to ${job.to}`);
          await Outbox.findByIdAndUpdate(job._id, { 
            $set: { status: 'sent' },
            $unset: { body: '' }
          });
          continue; // Skip - campaign was deleted
        }
        
        // FIRST CHECK: Database - if already marked as replied, skip immediately
        // (The polling service should have caught this, but this is a final safety check)
        if (campaign.replied) {
          await Outbox.findByIdAndUpdate(job._id, { 
            $set: { status: 'sent' }
          });
          continue; // Skip - already marked as replied in database
        }
        
        // SECOND CHECK: Gmail API - backup check in case polling service failed
        // This is a safety net if the cron job fails or hasn't run yet
        try {
          const { checkThreadForReply } = await import('./gmailService.js');
          const hasReply = await checkThreadForReply({
            fromEmail: job.from,
            threadId: job.headers?.threadId || campaign.threadId,
            recipientEmail: job.to,
          });
          if (hasReply) {
            // Mark campaign as replied and skip sending (polling service may have failed)
            await Campaign.findByIdAndUpdate(job.campaignRef.campaignId, { replied: true });
            await Outbox.findByIdAndUpdate(job._id, { 
              $set: { status: 'sent' }
            });
            console.log(`⚠️  Found reply for ${job.to} during send check (polling service may have missed it)`);
            continue; // Skip this email - they already replied
          }
        } catch (replyCheckError) {
          // If reply check fails, check if it's an OAuth error
          // OAuth errors (invalid_grant) mean the token expired, but we can still send
          // The polling service (bin/poll-replies.js) will handle reply detection
          const errorMsg = replyCheckError.message || String(replyCheckError);
          const isOAuthError = errorMsg.includes('invalid_grant') || errorMsg.includes('unauthorized');
          
          if (isOAuthError) {
            // OAuth error - skip reply check and proceed with sending
            // The polling service will catch replies, and the actual send will use the token
            console.warn(`⚠️  Reply check failed due to OAuth error for ${job.to} - proceeding with send (polling service will catch replies)`);
            // Clear the error and continue - don't reschedule
            await Outbox.findByIdAndUpdate(job._id, {
              $unset: { lastError: '' }
            });
            // Continue to send - don't skip
          } else {
            // Non-OAuth error - might be a real issue, but still proceed with sending
            // The reply check is just a safety net, polling service is primary
            console.warn(`⚠️  Reply check failed for ${job.to} (${errorMsg}) - proceeding anyway (polling service will catch replies)`);
            // Clear the error and continue
            await Outbox.findByIdAndUpdate(job._id, {
              $unset: { lastError: '' }
            });
            // Continue to send - don't skip
          }
        }
      }
      
      // PRE-SEND VALIDATION: Verify all required data is present before attempting to send
      // This catches data integrity issues early and provides clear error messages
      if (!job.to || !job.from || !job.subject) {
        throw new Error(`Missing required fields for job ${job._id}: to=${job.to}, from=${job.from}, subject=${job.subject}`);
      }
      
      // Validate account is configured
      const accountLimits = getAccountLimits(job.from);
      if (!accountLimits) {
        throw new Error(`Account not configured: ${job.from}`);
      }
      
      let emailBody = job.body;
      
      if (!emailBody) {
        // Regenerate body if missing - this should be rare but can happen
        console.warn(`⚠️  Missing body for job ${job._id} (${job.to}) - attempting regeneration`);
        
        // Try to get campaign name from campaignRef or by looking up campaignId
        let campaignName = job.campaignRef?.campaignName;
        let recipientName = job.campaignRef?.recipientName || '';
        let campaign = null;
        
        if (!campaignName && job.campaignRef?.campaignId) {
          const { Campaign } = await import('../models/Campaign.js');
          campaign = await Campaign.findById(job.campaignRef.campaignId).lean();
          if (campaign) {
            campaignName = campaign.campaignName;
            recipientName = campaign.recipientName || recipientName || '';
          }
        }
        
        if (!campaignName) {
          throw new Error(`Missing body for outbox job ${job._id} and no campaign name for regeneration`);
        }
        
        try {
          const { getTemplateForCampaign } = await import('./campaignDbService.js');
          const tpl = await getTemplateForCampaign(campaignName);
          
          if (!tpl) {
            throw new Error(`Template not found for campaign: ${campaignName}`);
          }
          
          if (job.type === 'initial') {
            // For initial emails, use touchpoint 1 (randomly select from variants 1, 1a-1i)
            const templatesMap = tpl.templates instanceof Map 
              ? Object.fromEntries(tpl.templates) 
              : tpl.templates || {};
            
            const firstTouchKeys = Object.keys(templatesMap)
              .filter((key) => key.toString().toLowerCase().startsWith('1'))
              .sort();
            
            if (firstTouchKeys.length === 0) {
              throw new Error(`No touchpoint 1 templates found`);
            }
            
            const chosenKey = firstTouchKeys[Math.floor(Math.random() * firstTouchKeys.length)];
            const templateBody = templatesMap[chosenKey];
            
            if (!templateBody) {
              throw new Error(`Template body is empty for key: ${chosenKey}`);
            }
            
            // Clean up recipient name
            if (recipientName && recipientName.includes(',')) {
              recipientName = recipientName.split(',')[0].trim();
            }
            if (recipientName.toLowerCase().startsWith('dear')) {
              recipientName = recipientName.replace(/^dear\s+/i, '').trim();
            }
            recipientName = recipientName ? recipientName.trim() : '';
            
            emailBody = templateBody;
            if (recipientName) {
              emailBody = emailBody.replace(/{recipientName}/gi, recipientName);
            } else {
              emailBody = emailBody.replace(/Dear\s+{recipientName},/gi, 'Hello,');
              emailBody = emailBody.replace(/{recipientName}/gi, '');
            }
            const senderName = getAccountDisplayName(job.from) || '';
            emailBody = emailBody.replace(/{senderName}/g, senderName);
            
            // Save regenerated body back to database
            await Outbox.findByIdAndUpdate(job._id, { 
              $set: { body: emailBody },
              $unset: { lastError: '' }
            });
          } else if (job.type === 'followup') {
            // For follow-ups, get touchpoint from campaign
            if (!campaign && job.campaignRef?.campaignId) {
              const { Campaign } = await import('../models/Campaign.js');
              campaign = await Campaign.findById(job.campaignRef.campaignId).lean();
            }
            
            if (campaign) {
              const nextTouch = Math.min(7, (campaign.touchpoint || 1) + 1);
              const templatesMap = tpl.templates instanceof Map 
                ? Object.fromEntries(tpl.templates) 
                : tpl.templates || {};
              const templateBody = templatesMap[nextTouch];
              if (templateBody) {
                recipientName = campaign.recipientName || recipientName || '';
                // Clean up recipient name
                if (recipientName && recipientName.includes(',')) {
                  recipientName = recipientName.split(',')[0].trim();
                }
                if (recipientName.toLowerCase().startsWith('dear')) {
                  recipientName = recipientName.replace(/^dear\s+/i, '').trim();
                }
                recipientName = recipientName ? recipientName.trim() : '';
                
                emailBody = templateBody;
                if (recipientName) {
                  emailBody = emailBody.replace(/{recipientName}/gi, recipientName);
                } else {
                  emailBody = emailBody.replace(/Dear\s+{recipientName},/gi, 'Hello,');
                  emailBody = emailBody.replace(/{recipientName}/gi, '');
                }
                const senderName = campaign.displayName || getAccountDisplayName(job.from) || '';
                emailBody = emailBody.replace(/{senderName}/g, senderName);
                
                await Outbox.findByIdAndUpdate(job._id, { 
                  $set: { body: emailBody },
                  $unset: { lastError: '' }
                });
              } else {
                throw new Error(`No template found for touchpoint ${nextTouch}`);
              }
            } else {
              throw new Error(`Campaign not found for follow-up email`);
            }
          }
        } catch (regenError) {
          console.error(`Failed to regenerate body for job ${job._id} (${job.to}):`, regenError.message);
          throw new Error(`Missing body for outbox job ${job._id} and regeneration failed: ${regenError.message}`);
        }
      }
      
      // Final validation - body must exist at this point
      if (!emailBody || emailBody.trim().length === 0) {
        throw new Error(`Email body is empty for job ${job._id} (${job.to})`);
      }
      
      // FINAL CHECK: One last database check right before sending (catches race conditions)
      // If a reply was detected by polling service between our earlier check and now, skip sending
      if (job.type === 'followup' && job.campaignRef?.campaignId) {
        const { Campaign } = await import('../models/Campaign.js');
        const finalCampaignCheck = await Campaign.findById(job.campaignRef.campaignId).select('replied').lean();
        
        // If campaign was deleted, cancel the follow-up
        if (!finalCampaignCheck) {
          console.warn(`⚠️  Campaign ${job.campaignRef.campaignId} was deleted before sending - cancelling follow-up to ${job.to}`);
          await Outbox.findByIdAndUpdate(job._id, { 
            $set: { status: 'sent' },
            $unset: { body: '' }
          });
          continue; // Skip - campaign was deleted
        }
        
        // If campaign was marked as replied (by polling service), skip sending
        if (finalCampaignCheck.replied) {
          await Outbox.findByIdAndUpdate(job._id, { 
            $set: { status: 'sent' }
          });
          continue; // Skip - they replied
        }
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
      // Mark this account as having sent in this batch to prevent multiple sends
      accountsSentThisBatch.add(job.from);
      
      // Update outbox status immediately (must complete to mark job as sent)
      // CRITICAL: NEVER delete body - keep it for 7 days minimum
      // Bodies are essential for retries, debugging, and preventing regeneration failures
      // The cleanupOldBodies() function will remove bodies after 7 days for sent/failed emails only
      // Pending/sending emails ALWAYS keep their bodies
      await Outbox.findByIdAndUpdate(job._id, { 
        $set: { status: 'sent' }
        // Body is kept for 7 days - cleanupOldBodies() handles removal for sent/failed only
      });
      
      // Removed follow-up batch counter - no longer needed without global limit
      
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


