import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

dotenv.config();

async function main() {
  await connectMongo();

  console.log('🧹 Cleaning up generatedBodies from Campaign documents...\n');

  // Count campaigns with generatedBodies
  const withBodies = await Campaign.countDocuments({
    generatedBodies: { $exists: true, $ne: [] }
  });

  if (withBodies === 0) {
    console.log('✅ No campaigns with generatedBodies found. Nothing to clean up.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${withBodies} campaigns with generatedBodies`);

  // Calculate size before cleanup
  const beforeStats = await Campaign.aggregate([
    {
      $project: {
        hasBodies: { $gt: [{ $size: { $ifNull: ['$generatedBodies', []] } }, 0] },
        docSize: { $bsonSize: '$$ROOT' }
      }
    },
    {
      $group: {
        _id: '$hasBodies',
        count: { $sum: 1 },
        totalSize: { $sum: '$docSize' }
      }
    }
  ]);

  const beforeSize = beforeStats.reduce((sum, stat) => sum + stat.totalSize, 0);
  console.log(`Total size before cleanup: ${(beforeSize / 1024 / 1024).toFixed(2)} MB\n`);

  // Remove generatedBodies from all campaigns
  const result = await Campaign.updateMany(
    { generatedBodies: { $exists: true } },
    { $unset: { generatedBodies: '' } }
  );

  console.log(`✅ Removed generatedBodies from ${result.modifiedCount} campaigns`);

  // Calculate size after cleanup
  const afterStats = await Campaign.aggregate([
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalSize: { $sum: { $bsonSize: '$$ROOT' } }
      }
    }
  ]);

  const afterSize = afterStats[0]?.totalSize || 0;
  const saved = beforeSize - afterSize;
  
  console.log(`\n📊 Results:`);
  console.log(`  Size before: ${(beforeSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Size after:  ${(afterSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Space saved: ${(saved / 1024 / 1024).toFixed(2)} MB`);

  await mongoose.disconnect();
  console.log('\n✅ Cleanup complete!');
}

main().catch(err => {
  console.error('Error cleaning up campaign bodies:', err.message || err);
  process.exit(1);
});

