#!/usr/bin/env node
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
    const maxMs = maxDelay * 24 * 60 * 60 * 1000;
    const diff = now - new Date(c.lastSent).getTime();
    return diff > maxMs; // Past the max window = overdue
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
  
  console.log(`📊 Found ${ready.length} ready campaigns, ${overdue.length} overdue campaigns, ${allCampaigns.length} total to process\n`);
  
  let queued = 0, skipped = 0, errors = 0;

  for (const c of allCampaigns) {
    try {
      // First check: Skip if campaign is already marked as replied in database
      if (c.replied) {
        skipped++;
        console.log(`⏭️  ${c.to}: Already marked as replied in database`);
        continue;
      }
      
      // Second check: Verify with Gmail API (may fail silently, so database check is primary)
      let hasReply = false;
      try {
        hasReply = await checkThreadForReply({
          fromEmail: c.from,
          threadId: c.threadId,
          recipientEmail: c.to,
        });
        if (hasReply) {
          // Mark in database and skip
          const { Campaign } = await import('../models/Campaign.js');
          await Campaign.findByIdAndUpdate(c._id, { replied: true });
          skipped++;
          console.log(`⏭️  ${c.to}: Found reply in thread, marked as replied`);
          continue;
        }
      } catch (replyCheckError) {
        // If reply check fails (OAuth error, API error, etc.), log it but continue
        // The database check above is the primary safeguard
        const errorMsg = replyCheckError.message || String(replyCheckError);
        console.warn(`⚠️  ${c.to}: Could not verify reply status (${errorMsg}), proceeding with caution`);
        // Continue - database check already passed, and we'll check again before sending
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


