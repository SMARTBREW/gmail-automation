import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { connectMongo } from '../src/db/mongo.js';

dotenv.config();

async function main() {
  await connectMongo();
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  console.log('📊 Collection Statistics (estimated via $bsonSize)\n');

  let totalSize = 0;
  let totalCount = 0;

  for (const { name } of collections) {
    const collection = db.collection(name);
    const [{ count = 0, size = 0 } = {}] = await collection
      .aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            size: { $sum: { $bsonSize: '$$ROOT' } },
          },
        },
      ])
      .toArray();

    const sizeMb = size / (1024 * 1024);
    const avgKb = count ? size / count / 1024 : 0;
    console.log(`${name}`);
    console.log(`  count        : ${count.toLocaleString()}`);
    console.log(`  est size     : ${sizeMb.toFixed(2)} MB`);
    console.log(`  avg doc size : ${avgKb.toFixed(2)} KB`);
    console.log('');
    
    totalSize += size;
    totalCount += count;
  }

  const totalSizeMb = totalSize / (1024 * 1024);
  const FREE_TIER_LIMIT_MB = 512;
  const remainingMb = Math.max(0, FREE_TIER_LIMIT_MB - totalSizeMb);
  const usagePercent = (totalSizeMb / FREE_TIER_LIMIT_MB * 100).toFixed(1);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 TOTAL DATABASE USAGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total documents: ${totalCount.toLocaleString()}`);
  console.log(`  Total size     : ${totalSizeMb.toFixed(2)} MB`);
  console.log(`  Usage          : ${usagePercent}% of ${FREE_TIER_LIMIT_MB} MB limit`);
  console.log(`  Remaining      : ${remainingMb.toFixed(2)} MB`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (totalSizeMb > FREE_TIER_LIMIT_MB * 0.9) {
    console.log('⚠️  WARNING: Database is over 90% full!');
    console.log('   Consider running cleanup scripts to free up space.\n');
  } else if (totalSizeMb > FREE_TIER_LIMIT_MB * 0.75) {
    console.log('⚠️  WARNING: Database is over 75% full.');
    console.log('   Consider running cleanup scripts soon.\n');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error reporting collection stats:', err.message || err);
  process.exit(1);
});
