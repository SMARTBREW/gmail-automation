#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';
import { processOutboxOnce } from '../src/services/queueService.js';

async function main() {
  await connectMongo();

  console.log('🔍 Outbox Diagnostic\n');
  console.log('='.repeat(60));

  const now = new Date();
  console.log(`Current time: ${now.toLocaleString()}\n`);

  // 1. Check PM2-like process (we can't check PM2 directly, but we can check if jobs are being processed)
  console.log('1️⃣  Checking Outbox Status:\n');

  // Check ready jobs
  const ready = await Outbox.find({
    status: 'pending',
    notBefore: { $lte: now }
  }).lean();

  console.log(`   Emails ready to send NOW: ${ready.length}`);
  if (ready.length > 0) {
    console.log('\n   Ready jobs:');
    ready.slice(0, 10).forEach(job => {
      const notBefore = new Date(job.notBefore).toLocaleString();
      const hasBody = job.body ? '✅' : '❌';
      console.log(`   ${hasBody} ${job.to} | notBefore: ${notBefore} | type: ${job.type}`);
    });
  }

  // Check stuck jobs
  const stuck = await Outbox.find({ status: 'sending' }).lean();
  console.log(`\n   Stuck jobs (status=sending): ${stuck.length}`);
  if (stuck.length > 0) {
    console.log('\n   Stuck jobs:');
    stuck.forEach(job => {
      const claimed = job.claimedAt ? new Date(job.claimedAt).toLocaleString() : 'N/A';
      console.log(`   - ${job.to} | claimed: ${claimed} | worker: ${job.workerId}`);
    });
  }

  // Check pending jobs with future notBefore
  const future = await Outbox.find({
    status: 'pending',
    notBefore: { $gt: now }
  }).lean();

  console.log(`\n   Pending jobs (scheduled for future): ${future.length}`);
  if (future.length > 0) {
    console.log('\n   Future jobs (first 5):');
    future.slice(0, 5).forEach(job => {
      const notBefore = new Date(job.notBefore).toLocaleString();
      const minutesUntil = Math.round((new Date(job.notBefore).getTime() - now.getTime()) / 60000);
      console.log(`   - ${job.to} | notBefore: ${notBefore} | in ${minutesUntil} minutes`);
    });
  }

  // Check sent jobs today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const sentToday = await Outbox.countDocuments({
    status: 'sent',
    updatedAt: { $gte: todayStart, $lte: todayEnd }
  });

  console.log(`\n   Sent today: ${sentToday}`);

  // Check failed jobs
  const failed = await Outbox.find({ status: 'failed' }).lean();
  console.log(`   Failed jobs: ${failed.length}`);
  if (failed.length > 0) {
    console.log('\n   Failed jobs (first 5):');
    failed.slice(0, 5).forEach(job => {
      console.log(`   - ${job.to} | error: ${job.lastError || 'N/A'}`);
    });
  }

  // 2. Check for jobs missing body
  const noBody = await Outbox.find({
    status: 'pending',
    notBefore: { $lte: now },
    $or: [{ body: { $exists: false } }, { body: null }, { body: '' }]
  }).lean();

  console.log(`\n   Jobs missing body: ${noBody.length}`);
  if (noBody.length > 0) {
    console.log('\n   ⚠️  WARNING: These jobs cannot be sent (missing body):');
    noBody.forEach(job => {
      console.log(`   - ${job.to} | type: ${job.type} | created: ${new Date(job.createdAt).toLocaleString()}`);
    });
  }

  // 3. Try to process Outbox manually
  console.log('\n2️⃣  Testing Outbox Processing:\n');
  try {
    console.log('   Attempting to process Outbox...');
    const result = await processOutboxOnce();
    console.log(`   ✅ Processed ${result.processed} email(s)`);
    
    if (result.processed === 0 && ready.length > 0) {
      console.log('\n   ⚠️  WARNING: No emails were processed even though there are ready jobs!');
      console.log('   This could mean:');
      console.log('   - Rate limits are blocking sending');
      console.log('   - Jobs are missing body content');
      console.log('   - OAuth errors are preventing sending');
    }
  } catch (error) {
    console.log(`   ❌ Error processing Outbox: ${error.message}`);
    console.log('   Stack:', error.stack);
  }

  // 4. Check account usage (rate limits)
  console.log('\n3️⃣  Checking Account Usage (Rate Limits):\n');
  try {
    const { AccountUsage } = await import('../src/models/AccountUsage.js');
    const accounts = await AccountUsage.find().lean();
    
    if (accounts.length > 0) {
      accounts.forEach(acc => {
        const lastSent = acc.lastSentAt ? new Date(acc.lastSentAt).toLocaleString() : 'Never';
        console.log(`   ${acc.email}:`);
        console.log(`     Sent today: ${acc.sentToday}`);
        console.log(`     Last sent: ${lastSent}`);
        console.log(`     Reset at: ${acc.resetAt ? new Date(acc.resetAt).toLocaleString() : 'N/A'}`);
      });
    } else {
      console.log('   No account usage records found');
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check account usage: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Next Steps:');
  if (ready.length > 0 && noBody.length === 0) {
    console.log('   - There are emails ready to send');
    console.log('   - Check if PM2 is running: pm2 list');
    console.log('   - Check PM2 logs: pm2 logs gmail-automation --lines 50');
  }
  if (noBody.length > 0) {
    console.log('   - ⚠️  Some jobs are missing body content - they cannot be sent');
    console.log('   - These jobs may need to be re-queued');
  }
  if (stuck.length > 0) {
    console.log('   - ⚠️  There are stuck jobs - they may need to be recovered');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});

