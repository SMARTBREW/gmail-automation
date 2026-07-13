#!/usr/bin/env node
/**
 * Job Search resume click report.
 * Usage: node scripts/job-search-resume-clicks.js
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
  .sort({ resumeClickedAt: -1, createdAt: -1 })
  .select('to recipientName company replied resumeClickedAt resumeClickCount touchpoint lastSent createdAt')
  .lean();

const clicked = rows.filter((r) => r.resumeClickedAt);
const notClicked = rows.filter((r) => !r.resumeClickedAt);

console.log(`\n=== Job Search resume clicks (who opened via resume link) ===`);
console.log(`Total campaigns: ${rows.length}`);
console.log(`Clicked resume:    ${clicked.length}`);
console.log(`Not clicked yet:   ${notClicked.length}`);
console.log(`Replied:           ${rows.filter((r) => r.replied).length}\n`);

if (clicked.length) {
  console.log('--- People who clicked resume (confirmed opened) ---');
  for (const r of clicked) {
    console.log(
      `${r.recipientName || '-'} <${r.to}> | ${r.company || '-'} | clicks=${r.resumeClickCount || 1} | first click ${fmtIst(r.resumeClickedAt)}${r.replied ? ' | REPLIED' : ''}`,
    );
  }
  console.log('');
} else {
  console.log('No resume clicks recorded yet.\n');
}

if (notClicked.length) {
  console.log(`--- No click yet (${notClicked.length}) ---`);
  for (const r of notClicked.slice(0, 30)) {
    console.log(
      `${r.recipientName || '-'} <${r.to}> | ${r.company || '-'} | TP${r.touchpoint || 1} | sent ${fmtIst(r.lastSent || r.createdAt)}${r.replied ? ' | REPLIED' : ''}`,
    );
  }
  if (notClicked.length > 30) console.log(`... and ${notClicked.length - 30} more`);
}

process.exit(0);
