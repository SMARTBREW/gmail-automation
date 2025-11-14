import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { getThreadSummary, extractRecipientNameFromBody } from '../src/services/gmailService.js';

dotenv.config();

/**
 * Backfill recipientName for campaigns that are missing it
 * by fetching the first email from Gmail and extracting the name
 */
async function main() {
  await connectMongo();

  console.log('🔄 Backfilling recipientName for campaigns...\n');

  // Find campaigns without recipientName
  const campaignsWithoutName = await Campaign.find({
    recipientName: { $in: [null, '', undefined] },
    threadId: { $exists: true, $ne: null }
  }).lean();

  console.log(`Found ${campaignsWithoutName.length} campaigns without recipientName\n`);

  if (campaignsWithoutName.length === 0) {
    console.log('✅ All campaigns already have recipientName');
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const campaign of campaignsWithoutName) {
    try {
      // Fetch the first email from Gmail thread
      const threadSummary = await getThreadSummary({
        fromEmail: campaign.from,
        threadId: campaign.threadId,
      });

      if (!threadSummary.firstEmailBody) {
        console.log(`⚠️  No email body found for ${campaign.to}, skipping`);
        skipped++;
        continue;
      }

      // Extract recipient name from the first email body
      const recipientName = extractRecipientNameFromBody(threadSummary.firstEmailBody);

      if (recipientName && recipientName.length > 1) {
        await Campaign.findByIdAndUpdate(campaign._id, {
          $set: { recipientName }
        });
        console.log(`✅ Updated ${campaign.to}: "${recipientName}"`);
        updated++;
      } else {
        console.log(`⚠️  Could not extract name for ${campaign.to}, skipping`);
        skipped++;
      }

      // Rate limit: wait a bit between API calls
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`❌ Error processing ${campaign.to}:`, err.message);
      failed++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Backfill complete!');
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Error backfilling recipient names:', err.message || err);
  process.exit(1);
});

