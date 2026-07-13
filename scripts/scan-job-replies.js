#!/usr/bin/env node
/**
 * Scan Job Search campaigns for replies (prints reply text; does not store body by default).
 * Usage:
 *   node scripts/scan-job-replies.js
 *   node scripts/scan-job-replies.js --save   # mark missed replies as replied (stops follow-ups)
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';
import {
  checkThreadForReply,
  getLatestHumanReply,
} from '../src/services/gmailService.js';
import { markRepliedWithDetails } from '../src/services/campaignDbService.js';
import { JOB_SEARCH_CAMPAIGN } from '../src/services/personalCampaignConfig.js';

const save = process.argv.includes('--save');

function fmtIst(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}

function cleanBody(text) {
  const s = String(text || '');
  const idx = s.search(/\nOn .{10,100} wrote:/i);
  const main = idx > 0 ? s.slice(0, idx) : s;
  return main.replace(/\s+/g, ' ').trim().slice(0, 400);
}

async function cancelFollowups(campaignId) {
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

async function main() {
  await connectMongo();

  const campaigns = await Campaign.find({
    campaignName: JOB_SEARCH_CAMPAIGN,
    threadId: { $exists: true, $ne: null },
    bounced: { $ne: true },
  })
    .sort({ lastSent: -1 })
    .lean();

  console.log(`Scanning ${campaigns.length} Job Search campaigns for replies...\n`);

  const already = [];
  const newlyFound = [];
  const errors = [];

  for (const c of campaigns) {
    process.stdout.write(`${c.to}... `);
    try {
      const has = await checkThreadForReply({
        fromEmail: c.from,
        threadId: c.threadId,
        recipientEmail: c.to,
        outboundSubject: c.subject || null,
        internetMessageId: c.internetMessageId || null,
        allInternetMessageIds: c.allInternetMessageIds || null,
        lastSent: c.lastSent || null,
      });

      if (!has) {
        console.log(c.replied ? 'marked replied (no live reply found)' : 'no reply');
        continue;
      }

      const reply = await getLatestHumanReply({
        fromEmail: c.from,
        threadId: c.threadId,
        recipientEmail: c.to,
        outboundSubject: c.subject || null,
        internetMessageId: c.internetMessageId || null,
        allInternetMessageIds: c.allInternetMessageIds || null,
        lastSent: c.lastSent || null,
      });

      const row = {
        to: c.to,
        name: c.recipientName || '',
        company: c.company || '',
        from: c.from,
        touchpoint: c.touchpoint || 1,
        repliedInDb: !!c.replied,
        replyAt: reply?.date || null,
        replyFrom: reply?.fromEmail || reply?.fromHeader || '',
        subject: reply?.subject || '',
        body: cleanBody(reply?.body || reply?.snippet || ''),
        campaignId: c._id,
        reply,
      };

      if (c.replied) {
        already.push(row);
        console.log(`reply (already in DB) @ ${fmtIst(row.replyAt)}`);
      } else {
        newlyFound.push(row);
        console.log(`REPLY FOUND @ ${fmtIst(row.replyAt)}`);
        if (save) {
          await markRepliedWithDetails({ campaignId: c._id, reply });
          await cancelFollowups(c._id);
          console.log('  → saved (follow-ups cancelled)');
        }
      }
    } catch (e) {
      errors.push({ to: c.to, error: e.message || String(e) });
      console.log(`ERROR: ${(e.message || String(e)).slice(0, 80)}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Already replied in DB: ${already.length}`);
  console.log(`New replies found:     ${newlyFound.length}${save ? ' (saved)' : ''}`);
  console.log(`Errors:                ${errors.length}`);

  const all = [...already, ...newlyFound].sort(
    (a, b) => new Date(b.replyAt || 0) - new Date(a.replyAt || 0),
  );

  if (all.length) {
    console.log('\n=== ALL JOB SEARCH REPLIES ===');
    all.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.name || '-'} <${r.to}> | ${r.company || '-'}`);
      console.log(`   From: ${r.replyFrom} | ${fmtIst(r.replyAt)} | TP${r.touchpoint}`);
      console.log(`   In DB: ${r.repliedInDb ? 'yes' : 'NO — missed'}`);
      if (r.subject) console.log(`   Subject: ${r.subject}`);
      if (r.body) console.log(`   ${r.body}`);
    });
  }

  if (newlyFound.length && !save) {
    console.log('\nRun with --save to mark missed replies and stop follow-ups.');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
