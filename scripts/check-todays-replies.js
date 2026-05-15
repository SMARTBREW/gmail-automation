#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';
import {
  getConfiguredAccounts,
  getAccountByEmail,
  getGmailClient,
  getLatestHumanReply,
} from '../src/services/gmailService.js';
import { markRepliedWithDetails } from '../src/services/campaignDbService.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getIstDayBounds(referenceDate = new Date()) {
  const shifted = new Date(referenceDate.getTime() + IST_OFFSET_MS);
  const startUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0,
    0,
    0,
    0,
  ) - IST_OFFSET_MS;
  const endUtc = startUtc + 24 * 60 * 60 * 1000;
  return {
    start: new Date(startUtc),
    end: new Date(endUtc),
    label: shifted.toISOString().slice(0, 10),
    gmailAfter: `${shifted.getUTCFullYear()}/${String(shifted.getUTCMonth() + 1).padStart(2, '0')}/${String(shifted.getUTCDate()).padStart(2, '0')}`,
  };
}

function isWithinIstDay(dateValue, bounds) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return date >= bounds.start && date < bounds.end;
}

function excerpt(text, max = 220) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function cancelPendingFollowups(campaignId) {
  return Outbox.updateMany(
    {
      type: 'followup',
      status: { $in: ['pending', 'sending'] },
      'campaignRef.campaignId': campaignId,
    },
    {
      $set: { status: 'sent' },
      $unset: { body: '' },
    },
  );
}

async function listTodayInboxThreadIds(accountEmail, bounds) {
  const account = getAccountByEmail(accountEmail);
  const gmail = getGmailClient(account.email, account.refreshToken);
  const query = `in:inbox after:${bounds.gmailAfter} -from:${accountEmail}`;
  const threadIds = new Set();
  let pageToken;

  do {
    const response = await gmail.users.threads.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      pageToken,
    });
    for (const thread of response.data.threads || []) {
      if (thread.id) threadIds.add(thread.id);
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return threadIds;
}

async function checkAccount(accountEmail, bounds) {
  const newlyFound = [];
  const errors = [];

  let todayThreadIds = new Set();
  try {
    todayThreadIds = await listTodayInboxThreadIds(accountEmail, bounds);
  } catch (error) {
    return {
      newlyFound,
      todaysReplies: [],
      errors: [{ to: accountEmail, error: error.message || String(error) }],
      scannedThreads: 0,
    };
  }

  if (todayThreadIds.size) {
    const campaigns = await Campaign.find({
      from: accountEmail,
      replied: false,
      threadId: { $in: [...todayThreadIds] },
    }).lean();

    for (const campaign of campaigns) {
      try {
        const reply = await getLatestHumanReply({
          fromEmail: accountEmail,
          threadId: campaign.threadId,
          recipientEmail: campaign.to,
          outboundSubject: campaign.subject || null,
          internetMessageId: campaign.internetMessageId || null,
          lastSent: campaign.lastSent || null,
        });
        if (!reply || !isWithinIstDay(reply.date, bounds)) continue;

        await markRepliedWithDetails({ campaignId: campaign._id, reply });
        await cancelPendingFollowups(campaign._id);
        newlyFound.push({
          to: campaign.to,
          replyFrom: reply.fromHeader || reply.fromEmail || '',
          subject: reply.subject || '',
          repliedAt: reply.date,
          body: excerpt(reply.body || reply.snippet || ''),
        });
      } catch (error) {
        errors.push({ to: campaign.to, error: error.message || String(error) });
      }
    }
  }

  const todaysReplies = await Campaign.find({
    from: accountEmail,
    replied: true,
    repliedAt: { $gte: bounds.start, $lt: bounds.end },
  })
    .sort({ repliedAt: -1 })
    .select('to replyFrom replyEmail replySubject replySnippet replyBody repliedAt campaignName')
    .lean();

  return {
    newlyFound,
    todaysReplies,
    errors,
    scannedThreads: todayThreadIds.size,
  };
}

async function main() {
  await connectMongo();
  const bounds = getIstDayBounds();
  const accounts = getConfiguredAccounts();

  console.log(`Checking today's replies for ${accounts.length} account(s)`);
  console.log(`IST date: ${bounds.label}`);
  console.log(`Window UTC: ${bounds.start.toISOString()} to ${bounds.end.toISOString()}\n`);

  let totalReplies = 0;
  let totalNew = 0;
  let totalErrors = 0;

  for (const accountEmail of accounts) {
    console.log(`=== ${accountEmail} ===`);
    try {
      const result = await checkAccount(accountEmail, bounds);
      totalReplies += result.todaysReplies.length;
      totalNew += result.newlyFound.length;
      totalErrors += result.errors.length;

      console.log(`Inbox threads today: ${result.scannedThreads}`);
      console.log(`Newly detected today: ${result.newlyFound.length}`);
      console.log(`Total replies today: ${result.todaysReplies.length}`);

      if (result.newlyFound.length) {
        console.log('New today:');
        for (const row of result.newlyFound) {
          console.log(`- ${row.to}`);
          console.log(`  From: ${row.replyFrom}`);
          console.log(`  Subject: ${row.subject}`);
          console.log(`  Text: ${row.body}`);
        }
      }

      if (result.todaysReplies.length) {
        console.log('All replies today:');
        for (const row of result.todaysReplies) {
          console.log(`- ${row.to}`);
          console.log(`  From: ${row.replyFrom || row.replyEmail || ''}`);
          console.log(`  Subject: ${row.replySubject || ''}`);
          console.log(`  At: ${row.repliedAt ? new Date(row.repliedAt).toISOString() : ''}`);
          console.log(`  Text: ${excerpt(row.replyBody || row.replySnippet || '')}`);
        }
      } else if (!result.newlyFound.length) {
        console.log('No replies today.');
      }

      if (result.errors.length) {
        console.log('Errors:');
        for (const row of result.errors) {
          console.log(`- ${row.to}: ${row.error}`);
        }
      }
    } catch (error) {
      totalErrors += 1;
      console.log(`Account error: ${error.message || String(error)}`);
    }
    console.log('');
  }

  console.log('Summary');
  console.log(`Accounts checked: ${accounts.length}`);
  console.log(`Replies today: ${totalReplies}`);
  console.log(`Newly detected today: ${totalNew}`);
  console.log(`Errors: ${totalErrors}`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
