#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  await connectMongo();

  console.log('🔍 Checking for orphaned follow-ups (campaigns deleted but follow-ups still exist)...\n');

  // Find all follow-ups with campaign IDs
  const allFollowups = await Outbox.find({
    type: 'followup',
    'campaignRef.campaignId': { $exists: true }
  }).lean();

  console.log(`Found ${allFollowups.length} follow-ups with campaign IDs\n`);

  // Group by campaign ID for efficient checking
  const campaignIds = [...new Set(allFollowups.map(f => f.campaignRef?.campaignId?.toString()).filter(Boolean))];
  console.log(`Checking ${campaignIds.length} unique campaign IDs...\n`);

  // Import mongoose for ObjectId
  const mongoose = (await import('../src/db/mongo.js')).default;

  // Check which campaigns exist
  const existingCampaigns = await Campaign.find({
    _id: { $in: campaignIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).select('_id').lean();

  const existingCampaignIds = new Set(existingCampaigns.map(c => c._id.toString()));

  // Find orphaned follow-ups
  const orphanedFollowups = allFollowups.filter(f => {
    const campaignId = f.campaignRef?.campaignId?.toString();
    return campaignId && !existingCampaignIds.has(campaignId);
  });

  console.log(`⚠️  Found ${orphanedFollowups.length} orphaned follow-ups\n`);

  if (orphanedFollowups.length === 0) {
    console.log('✅ No orphaned follow-ups found!');
    process.exit(0);
  }

  // Show breakdown by status
  const byStatus = {};
  orphanedFollowups.forEach(f => {
    byStatus[f.status] = (byStatus[f.status] || 0) + 1;
  });

  console.log('Status breakdown:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });

  // Show sample
  console.log('\nSample orphaned follow-ups:');
  orphanedFollowups.slice(0, 10).forEach((f, i) => {
    console.log(`\n${i + 1}. To: ${f.to} from ${f.from}`);
    console.log(`   Status: ${f.status}`);
    console.log(`   Created: ${new Date(f.createdAt).toISOString()}`);
    console.log(`   Updated: ${new Date(f.updatedAt).toISOString()}`);
    console.log(`   Campaign ID: ${f.campaignRef?.campaignId} (DELETED)`);
  });

  // Check if any are still pending
  const pendingOrphaned = orphanedFollowups.filter(f => f.status === 'pending' || f.status === 'sending');
  
  if (pendingOrphaned.length > 0) {
    console.log(`\n⚠️  ${pendingOrphaned.length} orphaned follow-ups are still pending/sending!`);
    console.log(`   These should be cancelled since the campaign was deleted.`);
    
    // Ask if user wants to cancel them
    const shouldCancel = process.argv.includes('--cancel');
    
    if (shouldCancel) {
      console.log('\n🧹 Cancelling orphaned follow-ups...');
      
      const cancelled = await Outbox.updateMany(
        {
          type: 'followup',
          status: { $in: ['pending', 'sending'] },
          'campaignRef.campaignId': { $in: orphanedFollowups.map(f => f.campaignRef?.campaignId).filter(Boolean) }
        },
        {
          $set: { status: 'sent' }, // Mark as sent so they won't be processed
          $unset: { body: '' } // Remove body to save space
        }
      );
      
      console.log(`✅ Cancelled ${cancelled.modifiedCount} orphaned follow-ups`);
    } else {
      console.log('\n💡 To cancel these orphaned follow-ups, run:');
      console.log('   node scripts/cleanup-orphaned-followups.js --cancel');
    }
  } else {
    console.log('\n✅ No pending orphaned follow-ups found');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

