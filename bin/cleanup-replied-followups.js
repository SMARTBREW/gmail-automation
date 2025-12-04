#!/usr/bin/env node
/**
 * Cleanup Follow-ups for Replied Campaigns
 * 
 * This script cancels any pending/sending follow-up emails for campaigns
 * that have been marked as replied. Run this periodically (e.g., daily)
 * as a safety net to catch any edge cases.
 * 
 * Usage: node bin/cleanup-replied-followups.js
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  await connectMongo();

  console.log('🧹 Cleaning up follow-ups for replied campaigns...\n');

  // Step 1: Get all replied campaigns
  const repliedCampaigns = await Campaign.find({ replied: true }).select('_id').lean();
  const repliedCampaignIds = repliedCampaigns.map(c => c._id);

  if (repliedCampaignIds.length === 0) {
    console.log('✅ No replied campaigns found - nothing to clean up');
    process.exit(0);
  }

  console.log(`Found ${repliedCampaignIds.length} replied campaigns\n`);

  // Step 2: Find pending/sending follow-ups for replied campaigns
  const pendingFollowups = await Outbox.find({
    type: 'followup',
    status: { $in: ['pending', 'sending'] },
    'campaignRef.campaignId': { $in: repliedCampaignIds }
  }).lean();

  if (pendingFollowups.length === 0) {
    console.log('✅ No pending follow-ups found for replied campaigns');
    process.exit(0);
  }

  console.log(`Found ${pendingFollowups.length} pending/sending follow-ups for replied campaigns\n`);

  // Step 3: Cancel them
  const cancelResult = await Outbox.updateMany(
    {
      type: 'followup',
      status: { $in: ['pending', 'sending'] },
      'campaignRef.campaignId': { $in: repliedCampaignIds }
    },
    {
      $set: { 
        status: 'sent' // Mark as sent so they won't be processed
      },
      $unset: { 
        body: '', // Remove body to save space
        lastError: '',
        claimedAt: '',
        workerId: ''
      }
    }
  );

  console.log(`✅ Cancelled ${cancelResult.modifiedCount} follow-ups\n`);

  // Step 4: Double-check using aggregation (catches any edge cases)
  const checkResult = await Outbox.aggregate([
    {
      $match: {
        type: 'followup',
        status: { $in: ['pending', 'sending'] },
        'campaignRef.campaignId': { $exists: true }
      }
    },
    {
      $lookup: {
        from: 'campaigns',
        localField: 'campaignRef.campaignId',
        foreignField: '_id',
        as: 'campaign'
      }
    },
    {
      $match: {
        'campaign.replied': true,
        'campaign.0': { $exists: true }
      }
    }
  ]);

  if (checkResult.length > 0) {
    console.log(`⚠️  Found ${checkResult.length} additional pending follow-ups via aggregation`);
    console.log(`   Cancelling them...`);
    
    const additionalIds = checkResult.map(f => f._id);
    const additionalCancel = await Outbox.updateMany(
      { _id: { $in: additionalIds } },
      {
        $set: { status: 'sent' },
        $unset: { body: '', lastError: '', claimedAt: '', workerId: '' }
      }
    );
    console.log(`   ✅ Cancelled ${additionalCancel.modifiedCount} additional follow-ups\n`);
  }

  // Step 5: Final verification
  const remaining = await Outbox.countDocuments({
    type: 'followup',
    status: { $in: ['pending', 'sending'] },
    'campaignRef.campaignId': { $in: repliedCampaignIds }
  });

  if (remaining === 0) {
    console.log('✅ All clean! No pending follow-ups for replied campaigns remain.');
  } else {
    console.log(`⚠️  Warning: ${remaining} follow-ups still pending - investigate manually`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

