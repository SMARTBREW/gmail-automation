#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

async function main() {
  await connectMongo();
  
  const now = new Date();
  console.log('🚀 Speeding up email sending...\n');
  console.log('Current time:', now.toLocaleString());
  
  // Step 1: Make all pending emails ready now
  console.log('\n1️⃣  Making all pending emails ready to send...');
  const result = await Outbox.updateMany(
    { status: 'pending' },
    { $set: { notBefore: now } }
  );
  console.log(`   ✅ Updated ${result.modifiedCount} emails to be ready now`);
  
  // Step 2: Temporarily reduce min interval in config.json
  console.log('\n2️⃣  Reducing min interval in config.json...');
  const configPath = path.resolve(process.cwd(), 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  
  let modified = 0;
  config.accounts.forEach(account => {
    if (account.minIntervalMs > 10000) {
      console.log(`   ⚠️  ${account.email}: Reducing minIntervalMs from ${account.minIntervalMs}ms to 10000ms (10 seconds)`);
      account.minIntervalMs = 10000; // 10 seconds instead of 60
      modified++;
    }
  });
  
  if (modified > 0) {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`   ✅ Updated ${modified} accounts in config.json`);
    console.log(`   ⚠️  WARNING: You'll need to restart the worker for this to take effect!`);
  } else {
    console.log(`   ✅ All accounts already have fast intervals`);
  }
  
  console.log('\n✅ Speed-up complete!');
  console.log('\n📋 Next steps:');
  console.log('   1. Restart your worker on EC2 (PM2 restart or restart the server)');
  console.log('   2. The worker will now send emails every 10 seconds instead of 60');
  console.log('   3. Monitor progress: node scripts/check-followup-status.js');
  console.log('\n⚠️  IMPORTANT: After clearing the backlog, consider increasing minIntervalMs back to 60000 to avoid Gmail rate limits!');
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

