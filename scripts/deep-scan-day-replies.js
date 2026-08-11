#!/usr/bin/env node
/**
 * Deep inbox scan: matches replies by threadId OR contact email in thread.
 * Usage: node scripts/deep-scan-day-replies.js 2026-08-10
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import {
  getConfiguredAccounts,
  getAccountByEmail,
  getGmailClient,
} from '../src/services/gmailService.js';
import { isPersonalCampaign, outreachCampaignFilter } from '../src/services/personalCampaignConfig.js';
import mongoose from '../src/db/mongo.js';

const dateArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getIstDayBoundsForLabel(label) {
  const [y, m, d] = label.split('-').map(Number);
  const startUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS;
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
  return `${dayBase.getUTCFullYear()}-${String(dayBase.getUTCMonth() + 1).padStart(2, '0')}-${String(dayBase.getUTCDate()).padStart(2, '0')}`;
}

function normEmail(s) {
  const raw = String(s || '').toLowerCase();
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

function inBounds(d, b) {
  const t = new Date(d).getTime();
  return t >= b.start.getTime() && t < b.end.getTime();
}

function isHuman(headers) {
  const auto = (headers['Auto-Submitted'] || '').toLowerCase();
  const prec = (headers['Precedence'] || '').toLowerCase();
  if (auto && auto !== 'no') return false;
  if (prec && (prec.includes('bulk') || prec.includes('junk') || prec.includes('auto_reply'))) return false;
  return true;
}

function excerpt(text, max = 100) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
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

async function getThreadHumanReplies(email, threadId, bounds) {
  const acc = getAccountByEmail(email);
  const gmail = getGmailClient(acc.email, acc.refreshToken);
  const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
  const replies = [];
  for (const msg of thread.data.messages || []) {
    const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name, h.value]));
    const from = normEmail(headers.From || '');
    if (!from || from === email.toLowerCase()) continue;
    if (!isHuman(headers)) continue;
    const date = new Date(Number(msg.internalDate || 0));
    if (!inBounds(date, bounds)) continue;
    let body = msg.snippet || '';
    replies.push({ from, date, subject: headers.Subject || '', body, threadId });
  }
  return replies;
}

async function main() {
  await connectMongo();
  const bounds = getIstDayBoundsForLabel(dateArg || getYesterdayLabel());

  const allCampaigns = await Campaign.find({ ...outreachCampaignFilter() })
    .select('from to threadId recipientName campaignName replied repliedAt')
    .lean();

  const byThread = new Map();
  const byContact = new Map();
  for (const c of allCampaigns) {
    if (c.threadId) {
      const k = `${c.from}|${c.threadId}`;
      if (!byThread.has(k)) byThread.set(k, c);
    }
    const ck = `${c.from}|${normEmail(c.to)}`;
    if (!byContact.has(ck)) byContact.set(ck, c);
  }

  const found = new Map();
  const errors = [];

  for (const email of getConfiguredAccounts()) {
    let threadIds;
    try {
      threadIds = await listInboxThreads(email, bounds);
    } catch (e) {
      errors.push({ email, error: e.message });
      continue;
    }

    for (const threadId of threadIds) {
      let replies;
      try {
        replies = await getThreadHumanReplies(email, threadId, bounds);
      } catch {
        continue;
      }
      if (!replies.length) continue;

      let campaign =
        byThread.get(`${email}|${threadId}`) ||
        null;

      if (!campaign) {
        for (const r of replies) {
          const c = byContact.get(`${email}|${r.from}`);
          if (c && !isPersonalCampaign(c.campaignName)) {
            campaign = c;
            break;
          }
        }
      }

      if (!campaign) {
        for (const r of replies) {
          const c = await Campaign.findOne({
            from: email,
            to: { $regex: new RegExp(r.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            ...outreachCampaignFilter(),
          }).lean();
          if (c) {
            campaign = c;
            break;
          }
        }
      }

      if (!campaign || isPersonalCampaign(campaign.campaignName)) continue;

      const r = replies[replies.length - 1];
      const key = `${email}|${normEmail(campaign.to)}|${bounds.label}`;
      if (found.has(key)) continue;

      found.set(key, {
        contact: campaign.recipientName || campaign.to,
        contactEmail: campaign.to,
        replyFrom: r.from,
        account: email,
        campaign: campaign.campaignName,
        time: r.date,
        preview: excerpt(r.body),
      });
    }
  }

  const dbRows = await Campaign.find({
    replied: true,
    repliedAt: { $gte: bounds.start, $lt: bounds.end },
    ...outreachCampaignFilter(),
  }).lean();

  for (const c of dbRows) {
    const key = `${c.from}|${normEmail(c.to)}|${bounds.label}`;
    if (!found.has(key)) {
      found.set(key, {
        contact: c.recipientName || c.to,
        contactEmail: c.to,
        replyFrom: normEmail(c.replyEmail || c.replyFrom || c.to),
        account: c.from,
        campaign: c.campaignName,
        time: c.repliedAt,
        preview: excerpt(c.replySnippet || c.replyBody),
        dbOnly: true,
      });
    }
  }

  const rows = [...found.values()].sort((a, b) => new Date(a.time) - new Date(b.time));

  console.log(`=== DEEP SCAN ${bounds.label} IST ===`);
  console.log(`Total NGO replies: ${rows.length}`);
  if (errors.length) {
    console.log(`Accounts with errors: ${errors.map((e) => e.email).join(', ')}`);
  }
  console.log('');

  rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.contact} (${r.contactEmail})`);
    console.log(`   Reply from: ${r.replyFrom}`);
    console.log(`   Account: ${r.account} | ${r.campaign}${r.dbOnly ? ' [DB only]' : ''}`);
    if (r.preview) console.log(`   ${r.preview}`);
  });

  console.log('\n=== WHATSAPP ===\n');
  console.log(`📬 NGO Replies — ${bounds.label} (${rows.length} total)\n`);
  rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.contact}`);
    console.log(`   From: ${r.replyFrom} → To: ${r.account}`);
    console.log(`   Campaign: ${r.campaign}`);
    if (r.preview) console.log(`   "${r.preview}"`);
    console.log('');
  });

  await mongoose.connection.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
