#!/usr/bin/env node
/**
 * Re-scan campaigns for replies, including when the prospect replied from a
 * different email address in the same (or correlated) thread.
 *
 * Usage:
 *   node bin/rescan-missed-replies.js
 *   node bin/rescan-missed-replies.js samriddhijwp1977@gmail.com
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';
import { getConfiguredAccounts, checkThreadForReply, getLatestHumanReply } from '../src/services/gmailService.js';
import { markRepliedWithDetails } from '../src/services/campaignDbService.js';

const daysBack = Number(process.env.RESCAN_DAYS || 30);

async function cancelPendingFollowups(campaignId) {
  return Outbox.updateMany(
    {
      type: 'followup',
      status: { $in: ['pending', 'sending'] },
      'campaignRef.campaignId': campaignId,
    },
    { $set: { status: 'sent' }, $unset: { body: '' } },
  );
}

async function rescanAccount(email) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const campaigns = await Campaign.find({
    from: email,
    replied: false,
    threadId: { $exists: true, $ne: null },
    lastSent: { $gte: since },
  })
    .sort({ lastSent: -1 })
    .lean();

  let found = 0;
  let errors = 0;

  for (const campaign of campaigns) {
    try {
      const hasReply = await checkThreadForReply({
        fromEmail: email,
        threadId: campaign.threadId,
        recipientEmail: campaign.to,
        outboundSubject: campaign.subject || null,
        internetMessageId: campaign.internetMessageId || null,
        allInternetMessageIds: campaign.allInternetMessageIds || null,
        lastSent: campaign.lastSent || null,
      });
      if (!hasReply) continue;

      const reply = await getLatestHumanReply({
        fromEmail: email,
        threadId: campaign.threadId,
        recipientEmail: campaign.to,
        outboundSubject: campaign.subject || null,
        internetMessageId: campaign.internetMessageId || null,
        allInternetMessageIds: campaign.allInternetMessageIds || null,
        lastSent: campaign.lastSent || null,
      });

      await markRepliedWithDetails({ campaignId: campaign._id, reply });
      await cancelPendingFollowups(campaign._id);
      found += 1;

      const replyFrom = reply?.fromEmail || reply?.fromHeader || 'unknown';
      const alt = replyFrom && replyFrom !== String(campaign.to).toLowerCase();
      console.log(
        `✅ ${campaign.to} (${campaign.recipientName || ''})` +
          (alt ? ` — reply from alternate: ${replyFrom}` : ` — reply from ${replyFrom}`),
      );
    } catch (err) {
      errors += 1;
      if (!String(err.message).includes('invalid_grant')) {
        console.error(`❌ ${campaign.to}: ${err.message}`);
      }
    }
  }

  return { checked: campaigns.length, found, errors };
}

async function main() {
  await connectMongo();
  const argEmail = process.argv[2];
  const accounts = argEmail ? [argEmail] : getConfiguredAccounts();

  console.log(`Rescanning last ${daysBack} days (replied: false, has threadId)...\n`);

  let totalFound = 0;
  let totalChecked = 0;

  for (const email of accounts) {
    console.log(`=== ${email} ===`);
    try {
      const r = await rescanAccount(email);
      totalFound += r.found;
      totalChecked += r.checked;
      console.log(`   Checked ${r.checked}, newly marked ${r.found}, errors ${r.errors}\n`);
    } catch (e) {
      console.error(`   Account failed: ${e.message}\n`);
    }
  }

  console.log(`Done. Checked ${totalChecked} campaigns, marked ${totalFound} new replies.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
