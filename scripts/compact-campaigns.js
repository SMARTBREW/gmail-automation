import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

dotenv.config();

/**
 * This script recreates the campaigns collection to remove fragmentation
 * and reduce storage overhead. MongoDB Atlas doesn't support compact(),
 * so we export, drop, and reimport the data.
 */
async function main() {
  await connectMongo();
  const db = mongoose.connection.db;

  console.log('🔄 Compacting campaigns collection...\n');

  // Get stats before
  const beforeStats = await db.command({ collStats: 'campaigns', scale: 1024 * 1024 });
  console.log('📊 Before:');
  console.log(`  Storage size: ${beforeStats.storageSize.toFixed(2)} MB`);
  console.log(`  Document count: ${beforeStats.count}\n`);

  // Export all documents
  console.log('📤 Exporting all campaign documents...');
  const allDocs = await Campaign.find({}).lean();
  console.log(`  Exported ${allDocs.length} documents\n`);

  // Drop the collection
  console.log('🗑️  Dropping campaigns collection...');
  await db.collection('campaigns').drop();
  console.log('  ✅ Dropped\n');

  // Recreate collection with same indexes
  console.log('🔄 Recreating collection and indexes...');
  await Campaign.createCollection();
  
  // Recreate indexes
  await Campaign.collection.createIndex({ campaignName: 1 });
  await Campaign.collection.createIndex({ to: 1 });
  await Campaign.collection.createIndex({ from: 1 });
  await Campaign.collection.createIndex({ touchpoint: 1 });
  await Campaign.collection.createIndex({ replied: 1 });
  await Campaign.collection.createIndex({ lastSent: 1 });
  await Campaign.collection.createIndex({ threadId: 1 });
  console.log('  ✅ Indexes recreated\n');

  // Reimport documents (in batches to avoid memory issues)
  console.log('📥 Reimporting documents...');
  const batchSize = 100;
  for (let i = 0; i < allDocs.length; i += batchSize) {
    const batch = allDocs.slice(i, i + batchSize);
    await Campaign.insertMany(batch, { ordered: false });
    console.log(`  Imported ${Math.min(i + batchSize, allDocs.length)}/${allDocs.length} documents`);
  }
  console.log('  ✅ All documents reimported\n');

  // Get stats after
  const afterStats = await db.command({ collStats: 'campaigns', scale: 1024 * 1024 });
  console.log('📊 After:');
  console.log(`  Storage size: ${afterStats.storageSize.toFixed(2)} MB`);
  console.log(`  Document count: ${afterStats.count}\n`);

  const saved = beforeStats.storageSize - afterStats.storageSize;
  const savedPercent = ((saved / beforeStats.storageSize) * 100).toFixed(1);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Compaction complete!');
  console.log(`  Space saved: ${saved.toFixed(2)} MB (${savedPercent}%)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Error compacting collection:', err.message || err);
  process.exit(1);
});

