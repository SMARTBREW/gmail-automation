#!/usr/bin/env node
/**
 * Poll for Replies
 * 
 * This script periodically checks for replies to campaign emails and marks
 * campaigns as replied. This is a simpler alternative to Gmail Push Notifications
 * that doesn't require Pub/Sub setup.
 * 
 * Usage:
 *   node bin/poll-replies.js                    # Check all accounts
 *   node bin/poll-replies.js <email>            # Check specific account
 *   node bin/poll-replies.js --interval 300     # Check every 5 minutes (default: 60s)
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { getConfiguredAccounts } from '../src/services/gmailService.js';
import { pollForReplies } from '../src/services/replyWebhookService.js';

// Parse arguments - skip flags like --once and --interval=
const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const email = args[0] || null;
const intervalArg = process.argv.find(arg => arg.startsWith('--interval='));
const intervalSeconds = intervalArg ? parseInt(intervalArg.split('=')[1]) : 60;

async function checkReplies() {
  await connectMongo();
  
  const accounts = email ? [email] : getConfiguredAccounts();
  
  console.log(`🔍 Checking for replies (${accounts.length} account(s))...\n`);
  
  let totalMarked = 0;
  let totalCancelled = 0;
  
  for (const accountEmail of accounts) {
    try {
      console.log(`Checking ${accountEmail}...`);
      const result = await pollForReplies(accountEmail, 200);
      
      if (result.markedAsReplied > 0) {
        console.log(`   ✅ Marked ${result.markedAsReplied} campaigns as replied`);
        console.log(`   🧹 Cancelled ${result.cancelledFollowups} follow-ups`);
        totalMarked += result.markedAsReplied;
        totalCancelled += result.cancelledFollowups;
      } else {
        console.log(`   ✅ No new replies found`);
      }
    } catch (error) {
      console.error(`   ❌ Error checking ${accountEmail}:`, error.message);
    }
  }
  
  if (totalMarked > 0) {
    console.log(`\n📊 Summary: Marked ${totalMarked} campaigns as replied, cancelled ${totalCancelled} follow-ups`);
  } else {
    console.log(`\n✅ No new replies detected`);
  }
}

async function main() {
  if (process.argv.includes('--once')) {
    // Run once and exit
    await checkReplies();
    process.exit(0);
  }
  
  // Run continuously
  console.log(`🚀 Starting reply polling (checking every ${intervalSeconds} seconds)`);
  console.log(`   Press Ctrl+C to stop\n`);
  
  // Run immediately
  await checkReplies();
  
  // Then run on interval
  setInterval(async () => {
    try {
      await checkReplies();
    } catch (error) {
      console.error('Error in polling cycle:', error.message);
    }
  }, intervalSeconds * 1000);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

