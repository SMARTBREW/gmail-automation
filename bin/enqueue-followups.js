#!/usr/bin/env node
/**
 * Enqueue Follow-up Emails
 * 
 * This script queues follow-up emails for campaigns that are ready for their next touchpoint.
 * 
 * Follow-up Schedule (days after previous touchpoint):
 * - TP1 → TP2: 3-5 days
 * - TP2 → TP3: 5-7 days
 * - TP3 → TP4: 7-9 days
 * - TP4 → TP5: 7-9 days
 * - TP5 → TP6: 10-13 days
 * - TP6 → TP7: 10-15 days
 * 
 * IMPORTANT: The schedule is RELATIVE to lastSent date, not absolute.
 * - If TP1 was sent 10-15 days late, TP2 will be queued immediately (it's overdue)
 * - Once TP2 is sent, TP3 will be queued 5-7 days after TP2 (normal schedule)
 * - This ensures campaigns catch up automatically, even if initial emails were delayed
 * 
 * The script processes:
 * 1. Campaigns within the normal window (minDays to maxDays)
 * 2. Overdue campaigns (past maxDays) - these need catch-up
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { campaignsReadyForFollowup, getTemplateForCampaign } from '../src/services/campaignDbService.js';
import { enqueueFollowup } from '../src/services/queueService.js';
import { getAccountDisplayName, checkThreadForReply } from '../src/services/gmailService.js';
import { Outbox } from '../src/models/Outbox.js';

function ensureAngle(id) {
  if (!id) return '';
  return id.startsWith('<') ? id : `<${id}>`;
}

async function main() {
  await connectMongo();

  const testMode = process.env.TEST_MODE === 'true' ? true : false;
  const ready = await campaignsReadyForFollowup(testMode);
  
  // Also get ALL overdue campaigns (past maxDays threshold) to catch up
  // This ensures campaigns that got their initial email late still get follow-ups
  const { Campaign } = await import('../src/models/Campaign.js');
  const now = Date.now();
  const schedule = {
    1: [3, 5], 2: [5, 7], 3: [7, 9], 4: [7, 9], 5: [10, 13], 6: [10, 15],
  };
  const overdueCampaigns = await Campaign.find({
    replied: false,
    touchpoint: { $lt: 7 },
    lastSent: { $exists: true, $ne: null }
  }).lean();
  
  const overdue = overdueCampaigns.filter(c => {
    const currentTp = c.touchpoint || 1;
    const [minDelay, maxDelay] = schedule[currentTp] || [999, 999];
    const minMs = minDelay * 24 * 60 * 60 * 1000;
    const maxMs = maxDelay * 24 * 60 * 60 * 1000;
    const diff = now - new Date(c.lastSent).getTime();
    // Include campaigns that are past the minimum delay (even if past max)
    // This catches up on campaigns that got delayed initial emails
    return diff >= minMs && diff > maxMs; // Past min but also past max = overdue, needs catch-up
  });
  
  // Combine ready and overdue, deduplicate by campaign ID
  const allCampaignsMap = new Map();
  ready.forEach(c => allCampaignsMap.set(c._id.toString(), c));
  overdue.forEach(c => {
    if (!allCampaignsMap.has(c._id.toString())) {
      allCampaignsMap.set(c._id.toString(), c);
    }
  });
  const allCampaigns = Array.from(allCampaignsMap.values());
  
  console.log(`📊 Found ${ready.length} ready campaigns (within window), ${overdue.length} overdue campaigns (needs catch-up), ${allCampaigns.length} total to process\n`);
  if (overdue.length > 0) {
    console.log(`💡 Note: Overdue campaigns include those that got initial emails late.`);
    console.log(`   Follow-ups will be sent based on lastSent date, so they'll catch up automatically.\n`);
  }
  
  let queued = 0, skipped = 0, errors = 0;

  for (const c of allCampaigns) {
    try {
      // Skip if campaign is already marked as replied in database
      // (Reply detection is handled by bin/poll-replies.js cron job)
      if (c.replied) {
        skipped++;
        console.log(`⏭️  ${c.to}: Already marked as replied in database`);
        continue;
      }
      
      // CRITICAL: Real-time reply check before enqueueing follow-up
      // This catches replies even if the cron job hasn't run yet or missed them
      if (c.threadId) {
        try {
          const hasReply = await checkThreadForReply({
            fromEmail: c.from,
            threadId: c.threadId,
            recipientEmail: c.to,
          });
          
          if (hasReply) {
            // Mark campaign as replied immediately
            const { Campaign } = await import('../src/models/Campaign.js');
            await Campaign.findByIdAndUpdate(c._id, { replied: true });
            
            // Cancel any existing pending follow-ups
            await Outbox.updateMany(
              {
                type: 'followup',
                status: { $in: ['pending', 'sending'] },
                'campaignRef.campaignId': c._id,
              },
              {
                $set: { status: 'sent' },
                $unset: { body: '' },
              }
            );
            
            skipped++;
            console.log(`⏭️  ${c.to}: Found reply in thread - marked as replied and cancelled follow-ups`);
            continue;
          }
        } catch (replyCheckError) {
          // If reply check fails (e.g., OAuth error), log but don't block enqueueing
          // The cron job will catch it later
          const errorMsg = replyCheckError.message || String(replyCheckError);
          if (errorMsg.includes('oauth2') || errorMsg.includes('token')) {
            console.warn(`⚠️  ${c.to}: Could not check for reply (OAuth error) - will check later via cron`);
          } else {
            console.warn(`⚠️  ${c.to}: Could not check for reply - ${errorMsg.substring(0, 50)}...`);
          }
          // Continue to enqueue - if there's actually a reply, the cron job will catch it
        }
      }

      // Check if there's already a pending follow-up email for this campaign
      const existingPending = await Outbox.findOne({
        type: 'followup',
        'campaignRef.campaignId': c._id,
        status: { $in: ['pending', 'sending'] }
      }).lean();
      
      if (existingPending) {
          skipped++;
        console.log(`⏭️  ${c.to}: Already has pending follow-up email (TP${c.touchpoint || 1} → TP${Math.min(7, (c.touchpoint || 1) + 1)}), skipping`);
          continue;
      }

      const nextTouch = Math.min(7, (c.touchpoint || 1) + 1);
      const tpl = await getTemplateForCampaign(c.campaignName);
      const templateBody = tpl.templates[nextTouch];
      const templateSubject = tpl.subjectLines[nextTouch];
      if (!templateBody) { skipped++; continue; }

      // Use stored recipientName from campaign
      const recipientName = c.recipientName || '';
      let body = templateBody;
      if (recipientName) {
        body = body.replace(/{recipientName}/g, recipientName);
      } else {
        body = body.replace(/Dear {recipientName},/g, 'Hello,').replace(/{recipientName}/g, '');
      }
      const senderName = c.displayName || getAccountDisplayName(c.from) || '';
      body = body.replace(/{senderName}/g, senderName);

      const subject = `Re: ${c.subject || templateSubject || ''}`;

      const firstMessageId = c.internetMessageId || (Array.isArray(c.messageIds) ? c.messageIds[0] : '');
      if (!firstMessageId) { skipped++; continue; }
      const inReplyTo = ensureAngle(firstMessageId);
      const all = c.allInternetMessageIds && c.allInternetMessageIds.length ? c.allInternetMessageIds : [firstMessageId];
      const references = all.map(ensureAngle).join(' ');

      await enqueueFollowup({
        from: c.from,
        to: c.to,
        subject,
        body,
        headers: { threadId: c.threadId, inReplyTo, references },
        campaignId: c._id,
        originalSubject: c.subject,
      });
      queued++;
      const isOverdue = overdue.some(oc => oc._id.toString() === c._id.toString());
      const status = isOverdue ? '🔴 OVERDUE' : '✅';
      console.log(`${status} queued TP${nextTouch} to ${c.to} from ${c.from}`);
    } catch (e) {
      errors++;
      const errorMsg = e.message || String(e);
      // Check if it's an OAuth2 error
      if (errorMsg.includes('oauth2') || errorMsg.includes('token') || errorMsg.includes('400') || errorMsg.includes('Bad Request')) {
        console.error(`❌ ${c.to} (from ${c.from}): OAuth2 token error - ${errorMsg}`);
        console.error(`   💡 This account (${c.from}) may need a new refresh token. Run: npm run generate-token`);
      } else {
        console.error(`❌ ${c.to} (from ${c.from}): ${errorMsg}`);
      }
    }
  }
  console.log(`\nSummary: queued=${queued}, skipped=${skipped}, errors=${errors}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


