#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';
import { AccountUsage } from '../src/models/AccountUsage.js';
import { processOutboxOnce } from '../src/services/queueService.js';

async function main() {
  await connectMongo();
  
  const now = new Date();
  const nowMs = now.getTime();
  
  console.log('🔍 Debugging why emails aren\'t sending...\n');
  console.log('Current time:', now.toISOString());
  console.log('Current time UTC:', now.toUTCString());
  console.log('');
  
  // Get a sample of pending emails
  const pending = await Outbox.find({
    status: 'pending',
    notBefore: { $gt: now }
  }).limit(5).lean();
  
  console.log('📧 Sample pending emails:');
  for (const job of pending) {
    const minutesUntil = Math.round((new Date(job.notBefore).getTime() - nowMs) / (1000 * 60));
    console.log(`\n   ${job.to} from ${job.from}:`);
    console.log(`     Scheduled for: ${new Date(job.notBefore).toISOString()}`);
    console.log(`     Minutes until: ${minutesUntil}`);
    
    // Check account usage
    const usage = await AccountUsage.findOne({ email: job.from }).lean();
    if (usage) {
      const lastSent = usage.lastSentAt ? new Date(usage.lastSentAt).getTime() : 0;
      const timeSinceLastSent = nowMs - lastSent;
      const minIntervalMs = 60000; // 60 seconds
      const canSendByInterval = !usage.lastSentAt || timeSinceLastSent >= minIntervalMs;
      
      console.log(`     Account status:`);
      console.log(`       Sent today: ${usage.sentToday}/400`);
      console.log(`       Last sent: ${usage.lastSentAt ? new Date(usage.lastSentAt).toISOString() : 'Never'}`);
      console.log(`       Time since last sent: ${Math.round(timeSinceLastSent / 1000)}s`);
      console.log(`       Min interval check: ${canSendByInterval ? '✅ PASS' : '❌ FAIL (needs ' + Math.round((minIntervalMs - timeSinceLastSent) / 1000) + 's more)'}`);
      console.log(`       Daily cap check: ${usage.sentToday < 400 ? '✅ PASS' : '❌ FAIL (at cap)'}`);
    }
  }
  
  // Try to process one email and see what happens
  console.log('\n\n🧪 Testing outbox processing...');
  try {
    const result = await processOutboxOnce();
    console.log(`   Processed: ${result.processed} emails`);
    if (result.processed === 0) {
      console.log('   ⚠️  No emails were processed - checking why...');
      
      // Check if there are any ready emails
      const ready = await Outbox.countDocuments({
        status: 'pending',
        notBefore: { $lte: now }
      });
      console.log(`   Ready emails (notBefore <= now): ${ready}`);
      
      if (ready === 0) {
        console.log('   ❌ No emails are ready - they\'re all scheduled for future');
        console.log('   💡 The worker is rescheduling them instead of sending');
      }
    }
  } catch (error) {
    console.error('   ❌ Error processing:', error.message);
    console.error('   Stack:', error.stack);
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

