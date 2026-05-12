#!/usr/bin/env node
/**
 * Cleanup script to:
 * 1. Check all campaigns for replies and mark them as replied
 * 2. Cancel any pending follow-ups for people who have replied
 * 3. Verify the database state is safe
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';
import { checkThreadForReply, getLatestHumanReply } from '../src/services/gmailService.js';
import { getUnrepliedCampaigns, markRepliedWithDetails } from '../src/services/campaignDbService.js';

async function main() {
  await connectMongo();

  console.log('🧹 Cleaning Up Replied Campaigns\n');
  console.log('='.repeat(60));

  // Get all unreplied campaigns
  const unreplied = await getUnrepliedCampaigns();
  console.log(`\nFound ${unreplied.length} campaigns marked as unreplied`);
  console.log('Checking each one for replies...\n');

  let foundReplies = 0;
  let checked = 0;
  let errors = 0;

  for (const campaign of unreplied) {
    checked++;
    try {
      const hasReply = await checkThreadForReply({
        fromEmail: campaign.from,
        threadId: campaign.threadId,
        recipientEmail: campaign.to,
      });

      if (hasReply) {
        const reply = await getLatestHumanReply({
          fromEmail: campaign.from,
          threadId: campaign.threadId,
        });
        await markRepliedWithDetails({ campaignId: campaign._id, reply });
        foundReplies++;
        console.log(`✅ ${campaign.to}: Found reply, marked as replied`);

        // Cancel any pending follow-ups for this campaign
        const cancelled = await Outbox.updateMany(
          {
            type: 'followup',
            status: 'pending',
            'campaignRef.campaignId': campaign._id,
          },
          {
            $set: { status: 'sent' }, // Mark as sent so they won't be processed
            $unset: { body: '' },
          }
        );

        if (cancelled.modifiedCount > 0) {
          console.log(`   ⚠️  Cancelled ${cancelled.modifiedCount} pending follow-up(s) for this campaign`);
        }
      }

      // Progress indicator
      if (checked % 10 === 0) {
        console.log(`   Checked ${checked}/${unreplied.length}...`);
      }
    } catch (error) {
      errors++;
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('oauth2') || errorMsg.includes('token') || errorMsg.includes('400')) {
        console.error(`❌ ${campaign.to}: OAuth2 error - cannot check reply status`);
        console.error(`   💡 This account (${campaign.from}) may need a new refresh token`);
      } else {
        console.error(`❌ ${campaign.to}: Error checking reply - ${errorMsg}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Checked: ${checked} campaigns`);
  console.log(`   Found replies: ${foundReplies} campaigns`);
  console.log(`   Errors: ${errors} campaigns`);
  console.log(`   Remaining unreplied: ${unreplied.length - foundReplies - errors}`);

  // Final safety check: Count pending follow-ups
  const pendingFollowups = await Outbox.find({ type: 'followup', status: 'pending' }).countDocuments();
  console.log(`\n⚠️  Remaining pending follow-ups: ${pendingFollowups}`);

  if (pendingFollowups > 0) {
    console.log('\n💡 These follow-ups will be checked for replies BEFORE sending');
    console.log('   (The system now checks replies right before sending as a safeguard)');
  }

  console.log('\n✅ Cleanup complete!');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});

