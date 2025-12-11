#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

const excludedAccount = process.argv[2] || 'neha.wingsofhope@gmail.com';

async function main() {
  await connectMongo();

  const now = new Date();
  
  console.log(`🚀 Making follow-ups ready to send (excluding ${excludedAccount})...\n`);

  // Find all pending follow-ups excluding the specified account
  const pendingFollowups = await Outbox.find({
    type: 'followup',
    status: 'pending',
    from: { $ne: excludedAccount }
  }).lean();

  console.log(`Found ${pendingFollowups.length} pending follow-ups\n`);

  if (pendingFollowups.length === 0) {
    console.log('✅ No pending follow-ups found');
    process.exit(0);
  }

  // Group by account
  const byAccount = {};
  pendingFollowups.forEach(f => {
    if (!byAccount[f.from]) byAccount[f.from] = [];
    byAccount[f.from].push(f);
  });

  console.log('📧 Pending follow-ups by account:\n');
  Object.entries(byAccount).forEach(([account, emails]) => {
    console.log(`   ${account}: ${emails.length}`);
  });

  // Check for overdue ones (scheduled for past)
  const overdue = pendingFollowups.filter(f => {
    if (!f.notBefore) return false;
    return new Date(f.notBefore) < now;
  });

  console.log(`\n⚠️  Overdue follow-ups (scheduled for past): ${overdue.length}`);

  // Update all pending follow-ups to be ready now
  console.log(`\n🔄 Making all ${pendingFollowups.length} follow-ups ready to send NOW...`);
  
  const result = await Outbox.updateMany(
    {
      type: 'followup',
      status: 'pending',
      from: { $ne: excludedAccount }
    },
    {
      $set: { notBefore: now }
    }
  );

  console.log(`✅ Updated ${result.modifiedCount} follow-ups to send immediately`);
  console.log(`\n📊 The worker will now start processing them (respecting rate limits)`);
  console.log(`   - Max 100 follow-ups per day (global limit)`);
  console.log(`   - 60 seconds between sends per account`);
  console.log(`   - Daily caps per account still apply`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

