#!/usr/bin/env node
/**
 * Poll for Replies
 *
 * Two passes per account (see replyPollConfig.js):
 * 1. Inbox-first — recent inbox threads → unreplied campaigns on that thread
 * 2. Campaign queue — rotated (follow-ups, stalest checks, newest sends)
 *
 * Usage:
 *   node bin/poll-replies.js --once
 *   node bin/poll-replies.js <email> --once
 *   node bin/poll-replies.js --interval=900    # every 15 min (recommended for cron)
 *
 * Env:
 *   REPLY_POLL_LIMIT=500
 *   REPLY_POLL_DAYS=90
 *   REPLY_POLL_MIN_HOURS_BETWEEN_CHECKS=2
 *   REPLY_INBOX_SCAN_DAYS=2
 *
 * Cron example (every 15 minutes):
 *   */15 * * * * cd /path/to/gmail-automation && node bin/poll-replies.js --once >> logs/poll-replies.log 2>&1
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { getConfiguredAccounts } from '../src/services/gmailService.js';
import { pollForReplies } from '../src/services/replyWebhookService.js';
import { getReplyPollConfig } from '../src/services/replyPollConfig.js';

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const email = args[0] || null;
const intervalArg = process.argv.find((arg) => arg.startsWith('--interval='));
const intervalSeconds = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 900;

async function checkReplies() {
  await connectMongo();

  const cfg = getReplyPollConfig();
  const accounts = email ? [email] : getConfiguredAccounts();

  console.log(`🔍 Reply poll (${accounts.length} account(s))`);
  console.log(
    `   Config: limit=${cfg.limit}, pollDays=${cfg.pollDays}, inboxDays=${cfg.inboxScanDays}, minHoursBetweenChecks=${cfg.minHoursBetweenChecks}\n`,
  );

  let totalMarked = 0;
  let totalCancelled = 0;
  let totalInboxThreads = 0;

  for (const accountEmail of accounts) {
    try {
      console.log(`Checking ${accountEmail}...`);
      const result = await pollForReplies(accountEmail);

      totalInboxThreads += result.inboxThreadsScanned || 0;
      totalMarked += result.markedAsReplied;
      totalCancelled += result.cancelledFollowups;

      console.log(`   Inbox threads scanned: ${result.inboxThreadsScanned || 0}`);
      console.log(`   Campaign queue checked: ${result.checked}`);
      if (result.markedAsReplied > 0) {
        console.log(
          `   ✅ Marked ${result.markedAsReplied} (inbox: ${result.inboxMarked}, queue: ${result.queueMarked})`,
        );
        console.log(`   🧹 Cancelled ${result.cancelledFollowups} follow-ups`);
      } else {
        console.log(`   ✅ No new replies`);
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
    console.log('');
  }

  if (totalMarked > 0) {
    console.log(
      `📊 Summary: ${totalInboxThreads} inbox threads, marked ${totalMarked} replied, cancelled ${totalCancelled} follow-ups`,
    );
  } else {
    console.log('✅ No new replies detected');
  }
}

async function main() {
  if (process.argv.includes('--once')) {
    await checkReplies();
    process.exit(0);
  }

  console.log(`🚀 Reply polling every ${intervalSeconds}s (use --once for cron)`);
  console.log('   Press Ctrl+C to stop\n');

  await checkReplies();

  setInterval(async () => {
    try {
      await checkReplies();
    } catch (error) {
      console.error('Error in polling cycle:', error.message);
    }
  }, intervalSeconds * 1000);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
