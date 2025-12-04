#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  await connectMongo();

  const now = new Date();

  console.log('🔄 Final Reset - After OAuth tokens are updated\n');
  console.log('Current time:', now.toISOString());
  console.log('');

  // Reset all pending emails
  const resetResult = await Outbox.updateMany(
    {
      status: 'pending'
    },
    {
      $set: { 
        attempts: 0,
        notBefore: now,
        status: 'pending'
      },
      $unset: { 
        lastError: '',
        claimedAt: '',
        workerId: ''
      }
    }
  );

  console.log(`✅ Reset ${resetResult.modifiedCount} emails`);
  console.log(`   - Cleared all errors`);
  console.log(`   - Reset all attempts`);
  console.log(`   - Set to send NOW`);
  console.log(`\n🚀 Worker should start sending immediately!`);
  console.log(`💡 Monitor: node scripts/check-followup-status.js`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

