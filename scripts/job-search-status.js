#!/usr/bin/env node
/**
 * Job Search status report: sent / replied / bounced / resume clicks.
 * Usage: node scripts/job-search-status.js
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { JOB_SEARCH_CAMPAIGN } from '../src/services/personalCampaignConfig.js';

function fmtIst(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}

await connectMongo();

const rows = await Campaign.find({ campaignName: JOB_SEARCH_CAMPAIGN })
  .sort({ lastSent: -1 })
  .lean();

const replied = rows.filter((r) => r.replied);
const bounced = rows.filter((r) => r.bounced);
const clicked = rows.filter((r) => r.resumeClickedAt);
const active = rows.filter((r) => !r.replied && !r.bounced);

const byTp = {};
for (const r of active) {
  const t = r.touchpoint || 1;
  byTp[t] = (byTp[t] || 0) + 1;
}

console.log('=== Job Search status ===\n');
console.log(`Total sent:      ${rows.length}`);
console.log(`Active (open):   ${active.length}`);
console.log(`Replied:         ${replied.length}`);
console.log(`Bounced:         ${bounced.length}`);
console.log(`Resume clicked:  ${clicked.length}`);
console.log('\nActive by touchpoint:');
Object.keys(byTp)
  .sort()
  .forEach((k) => console.log(`  TP${k}: ${byTp[k]}`));

if (replied.length) {
  console.log('\n--- Replied ---');
  for (const r of replied) {
    console.log(
      `- ${r.recipientName || '-'} <${r.to}> | ${r.company || '-'} | TP${r.touchpoint || 1} | lastSent ${fmtIst(r.lastSent)}`,
    );
  }
}

if (clicked.length) {
  console.log('\n--- Resume clicked (confirmed opened) ---');
  for (const r of clicked) {
    console.log(
      `- ${r.recipientName || '-'} <${r.to}> | ${r.company || '-'} | clicks=${r.resumeClickCount || 1} | first ${fmtIst(r.resumeClickedAt)}`,
    );
  }
}

if (bounced.length) {
  console.log('\n--- Bounced (no more follow-ups) ---');
  for (const r of bounced) {
    console.log(
      `- ${r.recipientName || '-'} <${r.to}> | ${r.company || '-'} | ${r.bounceReason || 'bounced'} | ${fmtIst(r.bouncedAt)}`,
    );
  }
}

process.exit(0);
