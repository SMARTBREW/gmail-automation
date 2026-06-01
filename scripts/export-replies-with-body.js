#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { writeFileSync, mkdirSync } from 'fs';
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

function fmtIst(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}

function normEmail(s) {
  const raw = String(s || '').toLowerCase();
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

async function main() {
  await connectMongo();

  const rows = await Campaign.find({
    replied: true,
    replyBody: { $exists: true, $type: 'string', $ne: '' },
  })
    .sort({ repliedAt: 1 })
    .select(
      'to from recipientName campaignName displayName replyFrom replyEmail replySubject replySnippet replyBody replyMessageId repliedAt threadId',
    )
    .lean();

  const replies = rows.map((r, i) => ({
    index: i + 1,
    contactEmail: r.to,
    recipientName: r.recipientName || '',
    campaignName: r.campaignName || '',
    accountEmail: r.from,
    displayName: r.displayName || '',
    repliedAtIst: fmtIst(r.repliedAt),
    repliedAtUtc: r.repliedAt ? new Date(r.repliedAt).toISOString() : '',
    replyFrom: r.replyFrom || '',
    replyEmail: normEmail(r.replyEmail || r.replyFrom),
    replySubject: r.replySubject || '',
    replySnippet: r.replySnippet || '',
    replyBody: r.replyBody || '',
    replyMessageId: r.replyMessageId || '',
    threadId: r.threadId || '',
  }));

  mkdirSync('exports', { recursive: true });

  const jsonPath = 'exports/replies-with-body.json';
  writeFileSync(
    jsonPath,
    JSON.stringify(
      { exportedAt: new Date().toISOString(), total: replies.length, replies },
      null,
      2,
    ),
    'utf8',
  );

  let md = `# Replies with body (${replies.length})\n\n`;
  md += `Exported: ${new Date().toISOString()}\n\n---\n\n`;

  for (const r of replies) {
    const accountLabel = r.displayName
      ? `${r.accountEmail} (${r.displayName})`
      : r.accountEmail;
    md += `## ${r.index}. ${r.recipientName || r.contactEmail}\n\n`;
    md += `- **Contact:** ${r.contactEmail}\n`;
    md += `- **Campaign:** ${r.campaignName}\n`;
    md += `- **Account:** ${accountLabel}\n`;
    md += `- **Replied (IST):** ${r.repliedAtIst}\n`;
    md += `- **Reply from:** ${r.replyFrom || r.replyEmail}\n`;
    md += `- **Subject:** ${r.replySubject}\n\n`;
    md += `### Reply body\n\n${r.replyBody}\n\n---\n\n`;
  }

  const mdPath = 'exports/replies-with-body.md';
  writeFileSync(mdPath, md, 'utf8');

  console.log(`✅ ${jsonPath} (${replies.length} replies)`);
  console.log(`✅ ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
