#!/usr/bin/env node
/**
 * Inbox scan for a specific IST calendar day vs DB.
 * Usage: node scripts/scan-day-replies.js              # yesterday IST
 *        node scripts/scan-day-replies.js 2026-06-02   # specific date
 *        node scripts/scan-day-replies.js --save      # also mark missed in DB
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import {
  getConfiguredAccounts,
  getAccountByEmail,
  getGmailClient,
  checkThreadForReply,
  getLatestHumanReply,
} from '../src/services/gmailService.js';
import { markRepliedWithDetails } from '../src/services/campaignDbService.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const BROKEN = new Set(['workneeharikakaila06@gmail.com', 'mehakpaws@gmail.com']);
const save = process.argv.includes('--save');
const dateArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

function getIstDayBoundsForLabel(label) {
  const [y, m, d] = label.split('-').map(Number);
  const startUtc =
    Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS;
  const endUtc = startUtc + 86400000;
  const next = new Date(startUtc + 86400000 + IST_OFFSET_MS);
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(next.getUTCDate()).padStart(2, '0');
  return {
    start: new Date(startUtc),
    end: new Date(endUtc),
    label,
    gmailAfter: `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`,
    gmailBefore: `${ny}/${nm}/${nd}`,
  };
}

function getYesterdayLabel() {
  const shifted = new Date(Date.now() + IST_OFFSET_MS);
  const dayBase = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
  dayBase.setUTCDate(dayBase.getUTCDate() - 1);
  const y = dayBase.getUTCFullYear();
  const m = String(dayBase.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dayBase.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function inBounds(d, b) {
  const t = new Date(d).getTime();
  return t >= b.start.getTime() && t < b.end.getTime();
}

function normEmail(s) {
  const raw = String(s || '').toLowerCase();
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

function dedupeKey(from, sender, date) {
  return `${normEmail(from)}|${normEmail(sender)}|${Math.floor(new Date(date).getTime() / 60000)}`;
}

function fmtIst(d) {
  return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}

function cleanBody(text) {
  const s = String(text || '');
  const idx = s.search(/\nOn .{10,100} wrote:/i);
  const main = idx > 0 ? s.slice(0, idx) : s;
  return main.replace(/\s+/g, ' ').trim().slice(0, 400);
}

async function listInboxThreads(email, bounds) {
  const acc = getAccountByEmail(email);
  const gmail = getGmailClient(acc.email, acc.refreshToken);
  const q = `in:inbox after:${bounds.gmailAfter} before:${bounds.gmailBefore} -from:${email}`;
  const ids = new Set();
  let pageToken;
  do {
    const r = await gmail.users.threads.list({ userId: 'me', q, maxResults: 100, pageToken });
    for (const t of r.data.threads || []) if (t.id) ids.add(t.id);
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function main() {
  await connectMongo();
  const bounds = getIstDayBoundsForLabel(dateArg || getYesterdayLabel());

  const dbRows = await Campaign.find({
    replied: true,
    repliedAt: { $gte: bounds.start, $lt: bounds.end },
  })
    .sort({ repliedAt: 1 })
    .lean();

  const dbSeen = new Map();
  for (const r of dbRows) {
    const k = dedupeKey(r.from, r.replyEmail || r.replyFrom || r.to, r.repliedAt);
    if (!dbSeen.has(k)) dbSeen.set(k, r);
  }

  const inboxReplies = [];
  const missed = [];
  const errors = [];

  console.log(`Scanning ${bounds.label} IST (inbox-verified)\n`);

  for (const email of getConfiguredAccounts()) {
    process.stdout.write(`${email}... `);
    if (BROKEN.has(email)) {
      console.log('SKIP (broken token)');
      continue;
    }

    let threadIds;
    try {
      threadIds = await listInboxThreads(email, bounds);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      errors.push({ email, error: e.message });
      continue;
    }

    let hits = 0;
    for (const threadId of threadIds) {
      const campaigns = await Campaign.find({ from: email, threadId }).lean();
      if (!campaigns.length) continue;
      const c = campaigns[0];

      try {
        const has = await checkThreadForReply({
          fromEmail: email,
          threadId,
          recipientEmail: c.to,
          outboundSubject: c.subject || null,
          internetMessageId: c.internetMessageId || null,
          allInternetMessageIds: c.allInternetMessageIds || null,
          lastSent: c.lastSent || null,
        });
        if (!has) continue;

        const reply = await getLatestHumanReply({
          fromEmail: email,
          threadId,
          recipientEmail: c.to,
          outboundSubject: c.subject || null,
          internetMessageId: c.internetMessageId || null,
          allInternetMessageIds: c.allInternetMessageIds || null,
          lastSent: c.lastSent || null,
        });
        if (!reply || !inBounds(reply.date, bounds)) continue;

        const sender = normEmail(reply.fromEmail || reply.fromHeader);
        const key = dedupeKey(email, sender, reply.date);
        if (inboxReplies.some((r) => r.key === key)) continue;

        const dbOk = campaigns.some(
          (x) => x.replied && x.repliedAt && inBounds(x.repliedAt, bounds),
        );

        const row = {
          key,
          account: email,
          contact: c.recipientName || c.to,
          contactEmail: c.to,
          campaign: c.campaignName,
          replyFrom: sender,
          replyAt: reply.date,
          subject: reply.subject || '',
          body: cleanBody(reply.body || reply.snippet),
          inDb: dbOk,
          campaignId: c._id,
          reply,
        };
        inboxReplies.push(row);
        hits++;

        if (!dbOk && save) {
          await markRepliedWithDetails({ campaignId: c._id, reply });
          missed.push(row);
        } else if (!dbOk) {
          missed.push(row);
        }
      } catch (e) {
        if (!String(e.message).includes('invalid_grant')) {
          errors.push({ email, contact: c.to, error: e.message });
        }
      }
    }
    console.log(`${threadIds.size} threads, ${hits} reply(s)`);
  }

  inboxReplies.sort((a, b) => new Date(a.replyAt) - new Date(b.replyAt));

  console.log('\n=== SUMMARY ===');
  console.log(`Date: ${bounds.label} IST`);
  console.log(`Inbox (unique): ${inboxReplies.length}`);
  console.log(`DB (unique):     ${dbSeen.size}`);
  console.log(`Missed in DB:    ${missed.length}${save ? ' (saved)' : ''}`);
  if (errors.length) console.log(`Errors:          ${errors.length}`);

  console.log('\n=== ALL REPLIES (inbox) ===');
  inboxReplies.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.contact} <${r.contactEmail}>`);
    console.log(`   ${r.campaign} | ${r.account}`);
    console.log(`   From: ${r.replyFrom} | ${fmtIst(r.replyAt)}`);
    console.log(`   In DB: ${r.inDb ? 'yes' : 'NO — missed'}`);
    if (r.body) console.log(`   ${r.body}`);
  });

  if (missed.length && !save) {
    console.log('\nRun with --save to write missed replies to DB.');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
