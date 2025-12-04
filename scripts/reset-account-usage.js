#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { AccountUsage } from '../src/models/AccountUsage.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  await connectMongo();
  
  const now = new Date();
  console.log('🔄 Resetting account usage to allow immediate sending...\n');
  
  // Reset lastSentAt for all accounts so they can send immediately
  const accounts = await AccountUsage.find().lean();
  let resetCount = 0;
  
  for (const acc of accounts) {
    // Set lastSentAt to 2 hours ago so min interval check passes
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    await AccountUsage.updateOne(
      { email: acc.email },
      { $set: { lastSentAt: twoHoursAgo } }
    );
    resetCount++;
    console.log(`✅ Reset lastSentAt for ${acc.email}`);
  }
  
  // Also make all pending emails ready now
  console.log('\n📧 Making all pending emails ready to send...');
  const emailResult = await Outbox.updateMany(
    { status: 'pending' },
    { $set: { notBefore: now } }
  );
  
  console.log(`\n✅ Reset ${resetCount} accounts`);
  console.log(`✅ Updated ${emailResult.modifiedCount} emails to send now`);
  console.log(`\n🚀 The worker should now start sending emails immediately!`);
  console.log(`   (No more min interval blocking)`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

