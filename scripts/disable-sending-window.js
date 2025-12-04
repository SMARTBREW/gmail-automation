#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  await connectMongo();
  
  const now = new Date();
  console.log('🚀 Disabling sending window and making all emails ready...\n');
  console.log('Current time:', now.toISOString());
  console.log('Current UTC time:', now.toUTCString());
  console.log('');
  
  // Make all emails ready NOW
  const result = await Outbox.updateMany(
    { status: 'pending' },
    { $set: { notBefore: now } }
  );
  
  console.log(`✅ Updated ${result.modifiedCount} emails to send immediately`);
  console.log('');
  console.log('⚠️  IMPORTANT: To actually bypass the sending window, you need to:');
  console.log('   1. Set environment variables on your EC2 server:');
  console.log('      export ALLOWED_WINDOW_START_HOUR=0');
  console.log('      export ALLOWED_WINDOW_END_HOUR=23');
  console.log('   2. Restart your worker (PM2 restart all)');
  console.log('');
  console.log('   OR edit src/services/queueService.js and change:');
  console.log('      const ALLOWED_WINDOW_START_HOUR = 0;');
  console.log('      const ALLOWED_WINDOW_END_HOUR = 23;');
  console.log('   Then restart the worker.');
  console.log('');
  console.log('💡 The worker will still respect min interval (60s) and daily caps (400/day)');
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

