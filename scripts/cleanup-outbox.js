import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

dotenv.config();

async function main() {
  await connectMongo();

  // When database is full, we must DELETE records (not update) to free space
  // Updates require write space which we don't have
  
  const daysArg = process.argv.indexOf('--days');
  const days = daysArg !== -1 && process.argv[daysArg + 1] 
    ? Number(process.argv[daysArg + 1]) 
    : 1; // Default to 1 day for aggressive cleanup when full
  
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  // Delete old sent/failed records (this frees space immediately)
  const query = {
    status: { $in: ['sent', 'failed'] },
    updatedAt: { $lte: cutoff },
  };

  const count = await Outbox.countDocuments(query);
  console.log(`🗑️  Deleting ${count} sent/failed records older than ${days} day(s)...`);
  
  if (count > 0) {
    const deleteResult = await Outbox.deleteMany(query);
    console.log(`   ✅ Deleted ${deleteResult.deletedCount} records`);
    console.log(`   💾 This should free up significant database space!`);
  } else {
    console.log(`   ℹ️  No records found to delete`);
    console.log(`   💡 Try: node scripts/cleanup-outbox.js --days 0 (deletes all sent/failed)`);
  }

  // Show final stats
  const stats = await Outbox.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  console.log('\n📊 Current Outbox Stats:');
  for (const stat of stats) {
    console.log(`   ${stat._id}: ${stat.count} records`);
  }
  
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  console.log(`   Total: ${total} records`);

  await mongoose.disconnect();
  console.log('\n✅ Cleanup complete!');
}

main().catch(err => {
  console.error('❌ Error during cleanup:', err.message || err);
  process.exit(1);
});

