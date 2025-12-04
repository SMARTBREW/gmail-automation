#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  await connectMongo();
  
  const now = new Date();
  console.log('🚀 Force sending all emails NOW (bypassing window restrictions)...\n');
  console.log('Current time:', now.toISOString());
  
  // Set ALL pending emails to NOW, regardless of window
  const result = await Outbox.updateMany(
    { status: 'pending' },
    { $set: { notBefore: now } }
  );
  
  console.log(`✅ Updated ${result.modifiedCount} emails to send immediately`);
  console.log(`\n⚠️  IMPORTANT: The worker will still respect the sending window (11:00-17:00 UTC)`);
  console.log(`   To bypass the window, you need to temporarily disable it in the code:`);
  console.log(`   1. Edit src/services/queueService.js`);
  console.log(`   2. Comment out the clampToAllowedWindow call in enqueueFollowup`);
  console.log(`   3. Restart the worker`);
  console.log(`\n   OR wait until 11:00 UTC (${new Date(new Date().setUTCHours(11,0,0,0)).toLocaleString()})`);
  console.log(`   when the window opens and emails will start sending automatically.`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

