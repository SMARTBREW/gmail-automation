#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';
import { checkThreadForReply, getLatestHumanReply } from '../src/services/gmailService.js';
import { markRepliedWithDetails } from '../src/services/campaignDbService.js';

const fromEmail = process.argv[2];
if (!fromEmail) {
  console.error('Usage: node scripts/backfill-account-replies.js <fromEmail>');
  process.exit(1);
}

function excerpt(text, max = 180) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function cancelPendingFollowups(campaignId) {
  return Outbox.updateMany(
    {
      type: 'followup',
      status: { $in: ['pending', 'sending'] },
      'campaignRef.campaignId': campaignId,
    },
    {
      $set: { status: 'sent' },
      $unset: { body: '' },
    }
  );
}

async function main() {
  await connectMongo();

  const alreadyReplied = await Campaign.find({
    from: fromEmail,
    replied: true,
    threadId: { $exists: true, $ne: null },
  })
    .sort({ createdAt: 1 })
    .lean();

  const unreplied = await Campaign.find({
    from: fromEmail,
    replied: false,
    threadId: { $exists: true, $ne: null },
    touchpoint: { $lt: 7 },
  })
    .sort({ createdAt: 1 })
    .lean();

  console.log(`Backfilling ${alreadyReplied.length} replied campaigns for ${fromEmail}`);
  console.log(`Scanning ${unreplied.length} unreplied campaigns (oldest first)\n`);

  let backfilled = 0;
  let backfillErrors = 0;
  let newlyFound = 0;
  let scanErrors = 0;
  const discovered = [];

  for (const campaign of alreadyReplied) {
    try {
      const reply = await getLatestHumanReply({
        fromEmail,
        threadId: campaign.threadId,
      });
      if (!reply) continue;
      await markRepliedWithDetails({ campaignId: campaign._id, reply });
      backfilled += 1;
    } catch (error) {
      backfillErrors += 1;
      console.error(`Backfill error ${campaign.to}: ${error.message || error}`);
    }
  }

  for (const campaign of unreplied) {
    try {
      const hasReply = await checkThreadForReply({
        fromEmail,
        threadId: campaign.threadId,
        recipientEmail: campaign.to,
      });
      if (!hasReply) continue;

      const reply = await getLatestHumanReply({
        fromEmail,
        threadId: campaign.threadId,
      });
      await markRepliedWithDetails({ campaignId: campaign._id, reply });
      const cancelled = await cancelPendingFollowups(campaign._id);
      newlyFound += 1;
      discovered.push({
        to: campaign.to,
        touchpoint: campaign.touchpoint,
        replyFrom: reply?.fromHeader || reply?.fromEmail || '',
        subject: reply?.subject || '',
        body: excerpt(reply?.body || reply?.snippet || ''),
        cancelledFollowups: cancelled.modifiedCount || 0,
      });
    } catch (error) {
      scanErrors += 1;
      console.error(`Scan error ${campaign.to}: ${error.message || error}`);
    }
  }

  const totalReplied = await Campaign.countDocuments({ from: fromEmail, replied: true });
  const withBody = await Campaign.countDocuments({
    from: fromEmail,
    replied: true,
    replyBody: { $exists: true, $ne: '' },
  });

  console.log('\nSummary');
  console.log(`Backfilled replied campaigns: ${backfilled}`);
  console.log(`Backfill errors: ${backfillErrors}`);
  console.log(`Newly discovered replies: ${newlyFound}`);
  console.log(`Scan errors: ${scanErrors}`);
  console.log(`Total replied for account: ${totalReplied}`);
  console.log(`Replied with stored body: ${withBody}`);

  if (discovered.length) {
    console.log('\nNew replies');
    for (const item of discovered) {
      console.log(`- ${item.to} (TP${item.touchpoint})`);
      console.log(`  From: ${item.replyFrom}`);
      console.log(`  Subject: ${item.subject}`);
      console.log(`  Text: ${item.body}`);
      if (item.cancelledFollowups) {
        console.log(`  Cancelled follow-ups: ${item.cancelledFollowups}`);
      }
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
