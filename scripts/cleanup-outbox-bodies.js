import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

dotenv.config();

async function main() {
  const minutesArg = process.argv.indexOf('--minutes');
  const minutes = minutesArg !== -1 && process.argv[minutesArg + 1] 
    ? Number(process.argv[minutesArg + 1]) 
    : 60; // Default to 60 minutes
  
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  await connectMongo();

  // Remove body from all outbox records older than X minutes
  // CRITICAL: NEVER delete bodies from pending emails - they may need to be retried!
  // Only delete from sent/failed emails that are old enough
  const query = {
    createdAt: { $lte: cutoff },
    body: { $exists: true, $ne: null },
    status: { $in: ['sent', 'failed'] } // NEVER delete from pending emails!
  };

  const count = await Outbox.countDocuments(query);
  console.log(`🗑️  Found ${count} outbox records older than ${minutes} minute(s) with body field...`);
  
  if (count > 0) {
    const result = await Outbox.updateMany(query, { $unset: { body: '' } });
    console.log(`   ✅ Removed body from ${result.modifiedCount} records`);
    console.log(`   💾 This should free up significant database space!`);
  } else {
    console.log(`   ℹ️  No records found to clean`);
  }

  // Show stats by status
  const stats = await Outbox.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        withBody: {
          $sum: { $cond: [{ $ifNull: ['$body', false] }, 1, 0] }
        }
      }
    }
  ]);

  console.log('\n📊 Current Outbox Stats:');
  for (const stat of stats) {
    console.log(`   ${stat._id}: ${stat.count} total, ${stat.withBody} with body`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Cleanup complete!');
}

main().catch(err => {
  console.error('❌ Error during cleanup:', err.message || err);
  process.exit(1);
});

