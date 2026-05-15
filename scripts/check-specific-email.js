#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';
import { checkThreadForReply, getLatestHumanReply } from '../src/services/gmailService.js';
import { markRepliedWithDetails } from '../src/services/campaignDbService.js';

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/check-specific-email.js <email-address>');
  process.exit(1);
}

async function main() {
  await connectMongo();

  console.log(`🔍 Checking email: ${email}\n`);

  // Find campaigns (try exact match and case-insensitive)
  const campaigns = await Campaign.find({
    $or: [
      { to: email },
      { to: { $regex: email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
    ]
  }).lean();

  if (campaigns.length === 0) {
    console.log(`❌ No campaign found for ${email}`);
    console.log(`\n💡 This email might have been sent manually or from a different system.`);
    process.exit(0);
  }

  for (const campaign of campaigns) {
    console.log('📊 Campaign Details:');
    console.log(`   To: ${campaign.to}`);
    console.log(`   From: ${campaign.from}`);
    console.log(`   Campaign Name: ${campaign.campaignName}`);
    console.log(`   Touchpoint: ${campaign.touchpoint}`);
    console.log(`   Replied: ${campaign.replied}`);
    console.log(`   Thread ID: ${campaign.threadId || 'N/A'}`);
    console.log(`   Last Sent: ${campaign.lastSent ? new Date(campaign.lastSent).toISOString() : 'N/A'}`);
    console.log(`   Created: ${new Date(campaign.createdAt).toISOString()}`);
    console.log(`   Updated: ${new Date(campaign.updatedAt).toISOString()}\n`);

    // Check all follow-ups for this campaign
    const followups = await Outbox.find({
      type: 'followup',
      'campaignRef.campaignId': campaign._id
    }).sort({ createdAt: 1 }).lean();

    console.log(`📧 Follow-ups (${followups.length} total):\n`);

    followups.forEach((f, i) => {
      const created = new Date(f.createdAt);
      const updated = new Date(f.updatedAt);
      const campaignUpdated = new Date(campaign.updatedAt);
      
      console.log(`${i + 1}. Follow-up:`);
      console.log(`   Status: ${f.status}`);
      console.log(`   Created: ${created.toISOString()}`);
      console.log(`   Updated/Sent: ${updated.toISOString()}`);
      console.log(`   Subject: ${f.subject?.substring(0, 60)}...`);
      
      if (f.status === 'sent' && updated > campaignUpdated && campaign.replied) {
        const hoursAfter = Math.round((updated.getTime() - campaignUpdated.getTime()) / (1000 * 60 * 60));
        console.log(`   ⚠️  VIOLATION: Sent ${hoursAfter} hours AFTER campaign was marked as replied!`);
      }
      
      if (created > campaignUpdated && campaign.replied) {
        const hoursAfter = Math.round((created.getTime() - campaignUpdated.getTime()) / (1000 * 60 * 60));
        console.log(`   ⚠️  VIOLATION: Queued ${hoursAfter} hours AFTER campaign was marked as replied!`);
      }
      console.log('');
    });

    // Check if campaign should be marked as replied
    if (!campaign.replied && campaign.threadId) {
      console.log('🔍 Campaign is NOT marked as replied. Checking thread for replies...\n');
      
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
          console.log(`   ⚠️  FOUND REPLY! Campaign should be marked as replied but isn't!`);
          console.log(`   This is why follow-ups were sent.\n`);
          
          // Offer to fix it
          console.log('💡 Fixing this now...');
          const reply = await getLatestHumanReply({
            fromEmail: campaign.from,
            threadId: campaign.threadId,
            recipientEmail: campaign.to,
            outboundSubject: campaign.subject || null,
            internetMessageId: campaign.internetMessageId || null,
            lastSent: campaign.lastSent || null,
          });
          await markRepliedWithDetails({ campaignId: campaign._id, reply });
          
          // Cancel pending follow-ups
          const cancelled = await Outbox.updateMany(
            {
              type: 'followup',
              status: { $in: ['pending', 'sending'] },
              'campaignRef.campaignId': campaign._id
            },
            {
              $set: { status: 'sent' },
              $unset: { body: '' }
            }
          );
          
          console.log(`   ✅ Marked campaign as replied`);
          console.log(`   🧹 Cancelled ${cancelled.modifiedCount} pending follow-ups`);
        } else {
          console.log(`   ✅ No reply found in thread.`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking thread: ${error.message}`);
        if (error.message.includes('oauth2') || error.message.includes('token')) {
          console.log(`   💡 OAuth token issue - cannot verify reply status`);
        }
      }
    } else if (campaign.replied) {
      console.log('✅ Campaign is already marked as replied.');
      
      // Check if there are any pending follow-ups (shouldn't happen)
      const pending = await Outbox.countDocuments({
        type: 'followup',
        status: { $in: ['pending', 'sending'] },
        'campaignRef.campaignId': campaign._id
      });
      
      if (pending > 0) {
        console.log(`   ⚠️  Found ${pending} pending follow-ups - these should be cancelled!`);
      }
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

