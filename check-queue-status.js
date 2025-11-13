#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from './src/db/mongo.js';
import { Outbox } from './src/models/Outbox.js';
import { AccountUsage } from './src/models/AccountUsage.js';

async function main() {
  await connectMongo();
  
  console.log('📊 Queue Status Report\n');
  
  // Get queue stats
  const stats = await Outbox.aggregate([
    { $group: { _id: { from: '$from', status: '$status' }, count: { $sum: 1 } } },
    { $sort: { '_id.from': 1, '_id.status': 1 } },
  ]);
  
  console.log('Queue Statistics:');
  console.log('==================');
  for (const stat of stats) {
    console.log(`${stat._id.from} - ${stat._id.status}: ${stat.count}`);
  }
  
  // Get pending jobs
  const pending = await Outbox.find({ status: 'pending' }).limit(10).lean();
  console.log(`\n📋 Sample Pending Jobs (showing first 10):`);
  for (const job of pending) {
    const notBefore = new Date(job.notBefore);
    const now = new Date();
    const ready = notBefore <= now;
    console.log(`  - ${job.to} | notBefore: ${notBefore.toLocaleString()} | ready: ${ready ? '✅' : '⏳'}`);
  }
  
  // Get failed jobs
  const failed = await Outbox.find({ status: 'failed' }).limit(5).lean();
  if (failed.length > 0) {
    console.log(`\n❌ Failed Jobs (showing first 5):`);
    for (const job of failed) {
      console.log(`  - ${job.to} | error: ${job.lastError || 'unknown'}`);
    }
  }
  
  // Get sending jobs (stuck?)
  const sending = await Outbox.find({ status: 'sending' }).lean();
  if (sending.length > 0) {
    console.log(`\n⚠️  Stuck "Sending" Jobs: ${sending.length}`);
    for (const job of sending) {
      const claimedAt = new Date(job.claimedAt);
      const age = Date.now() - claimedAt.getTime();
      console.log(`  - ${job.to} | claimed ${Math.floor(age / 1000)}s ago`);
    }
  }
  
  // Get usage stats
  const usage = await AccountUsage.find({}).lean();
  console.log(`\n📈 Account Usage:`);
  for (const u of usage) {
    console.log(`  - ${u.email}: sentToday=${u.sentToday}, lastSentAt=${u.lastSentAt || 'never'}`);
  }
  
  // Check if server is processing
  const totalPending = await Outbox.countDocuments({ status: 'pending' });
  const totalSent = await Outbox.countDocuments({ status: 'sent' });
  const totalFailed = await Outbox.countDocuments({ status: 'failed' });
  
  console.log(`\n📊 Summary:`);
  console.log(`  Total Pending: ${totalPending}`);
  console.log(`  Total Sent: ${totalSent}`);
  console.log(`  Total Failed: ${totalFailed}`);
  
  if (totalPending > 0 && totalSent === 0) {
    console.log(`\n⚠️  WARNING: ${totalPending} emails are queued but none have been sent yet.`);
    console.log(`   This suggests the server may not be processing the queue.`);
    console.log(`   Make sure the MCP server is running on your deployed server.`);
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

