import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

dotenv.config();

async function main() {
  await connectMongo();
  const db = mongoose.connection.db;

  console.log('🧹 Removing originalEmailBody from Campaign documents...\n');

  // Count documents with originalEmailBody
  const withBody = await Campaign.countDocuments({ 
    originalEmailBody: { $exists: true, $ne: null } 
  });

  if (withBody === 0) {
    console.log('✅ No documents with originalEmailBody found. Nothing to clean up.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${withBody} documents with originalEmailBody`);

  // Get stats before
  const beforeStats = await db.command({ collStats: 'campaigns', scale: 1024 * 1024 });
  console.log(`Storage size before: ${beforeStats.storageSize.toFixed(2)} MB\n`);

  // Calculate total size of originalEmailBody
  const docs = await Campaign.find({ originalEmailBody: { $exists: true, $ne: null } }).lean();
  let totalBodySize = 0;
  for (const doc of docs) {
    if (doc.originalEmailBody) {
      totalBodySize += Buffer.byteLength(doc.originalEmailBody, 'utf8');
    }
  }
  console.log(`Total originalEmailBody size: ${(totalBodySize / 1024 / 1024).toFixed(2)} MB\n`);

  // Remove originalEmailBody from all documents
  console.log('🗑️  Removing originalEmailBody field...');
  const result = await Campaign.updateMany(
    { originalEmailBody: { $exists: true } },
    { $unset: { originalEmailBody: '' } }
  );

  console.log(`✅ Removed originalEmailBody from ${result.modifiedCount} documents\n`);

  // Get stats after
  const afterStats = await db.command({ collStats: 'campaigns', scale: 1024 * 1024 });
  console.log(`Storage size after: ${afterStats.storageSize.toFixed(2)} MB`);

  const saved = beforeStats.storageSize - afterStats.storageSize;
  const savedPercent = ((saved / beforeStats.storageSize) * 100).toFixed(1);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Cleanup complete!');
  console.log(`  Space saved: ${saved.toFixed(2)} MB (${savedPercent}%)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Error removing originalEmailBody:', err.message || err);
  process.exit(1);
});

