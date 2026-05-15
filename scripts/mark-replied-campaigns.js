#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';
import { checkThreadForReply, getLatestHumanReply } from '../src/services/gmailService.js';
import { markRepliedWithDetails } from '../src/services/campaignDbService.js';

async function main() {
  await connectMongo();

  console.log('🔍 Checking campaigns for replies and marking them as replied...\n');

  // Get campaigns that are NOT marked as replied but might have replies
  const unrepliedCampaigns = await Campaign.find({
    replied: false,
    threadId: { $exists: true, $ne: null },
    touchpoint: { $lt: 7 } // Only check campaigns that haven't completed all touchpoints
  }).limit(100).lean();

  console.log(`Found ${unrepliedCampaigns.length} unreplied campaigns to check\n`);

  let markedAsReplied = 0;
  let checkErrors = 0;
  let hasReplies = 0;

  for (const campaign of unrepliedCampaigns) {
    try {
      const hasReply = await checkThreadForReply({
        fromEmail: campaign.from,
        threadId: campaign.threadId,
        recipientEmail: campaign.to,
        outboundSubject: campaign.subject || null,
        internetMessageId: campaign.internetMessageId || null,
        lastSent: campaign.lastSent || null,
      });
      
      if (hasReply) {
        hasReplies++;
        const reply = await getLatestHumanReply({
          fromEmail: campaign.from,
          threadId: campaign.threadId,
          recipientEmail: campaign.to,
          outboundSubject: campaign.subject || null,
          internetMessageId: campaign.internetMessageId || null,
          lastSent: campaign.lastSent || null,
        });
        await markRepliedWithDetails({ campaignId: campaign._id, reply });
        markedAsReplied++;
        
        console.log(`✅ ${campaign.to}: Found reply, marked as replied`);
        
        // Cancel any pending follow-ups for this campaign
        const cancelled = await Outbox.updateMany(
          {
            type: 'followup',
            status: { $in: ['pending', 'sending'] },
            'campaignRef.campaignId': campaign._id
          },
          {
            $set: { status: 'sent' }, // Mark as sent so they won't be processed
            $unset: { body: '' } // Remove body to save space
          }
        );
        
        if (cancelled.modifiedCount > 0) {
          console.log(`   🧹 Cancelled ${cancelled.modifiedCount} pending follow-ups`);
        }
      }
    } catch (error) {
      checkErrors++;
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('oauth2') || errorMsg.includes('token') || errorMsg.includes('invalid_grant')) {
        console.log(`   ⚠️  ${campaign.to}: OAuth error - cannot check (${errorMsg.substring(0, 50)}...)`);
      } else {
        console.log(`   ❌ ${campaign.to}: Error checking - ${errorMsg.substring(0, 50)}...`);
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Marked as replied: ${markedAsReplied}`);
  console.log(`   ⚠️  Check errors: ${checkErrors}`);
  console.log(`   📧 Total checked: ${unrepliedCampaigns.length}`);

  if (markedAsReplied > 0) {
    console.log(`\n✅ Successfully marked ${markedAsReplied} campaigns as replied`);
    console.log(`   These campaigns will no longer receive follow-ups.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

