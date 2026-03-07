#!/usr/bin/env node
/**
 * Generates data for the outreach presentation:
 * - Overview: total email db, response analysis
 * - By Executive: email handles, login status, total sent, response analysis
 * - Outputs JSON and optionally writes to a file for slides
 */
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadConfigSafe() {
  try {
    const configPath = path.resolve(process.cwd(), 'config.json');
    const data = JSON.parse(readFileSync(configPath, 'utf8'));
    return data.accounts || [];
  } catch {
    return [];
  }
}

async function main() {
  await connectMongo();

  const configAccounts = loadConfigSafe();
  const configuredEmails = new Set(configAccounts.map((a) => (a.email || '').toLowerCase().trim()));

  // --- Overview ---
  const totalCampaigns = await Campaign.countDocuments({});
  const totalReplied = await Campaign.countDocuments({ replied: true });
  const totalUnreplied = await Campaign.countDocuments({ replied: false });
  const responseRate = totalCampaigns ? ((totalReplied / totalCampaigns) * 100).toFixed(1) : '0';

  const initialSent = await Outbox.countDocuments({ type: 'initial', status: 'sent' });
  const followupSent = await Outbox.countDocuments({ type: 'followup', status: 'sent' });
  const totalEmailsSent = initialSent + followupSent;

  const repliedByTouchpoint = await Campaign.aggregate([
    { $match: { replied: true } },
    { $group: { _id: '$touchpoint', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const overview = {
    totalCampaigns,
    totalReplied,
    totalUnreplied,
    responseRatePct: responseRate,
    initialEmailsSent: initialSent,
    followupEmailsSent: followupSent,
    totalEmailsSent,
    repliedByTouchpoint: repliedByTouchpoint.reduce((acc, { _id, count }) => {
      acc[`touchpoint_${_id}`] = count;
      return acc;
    }, {}),
  };

  // --- By Executive (per account) ---
  const campaignByFrom = await Campaign.aggregate([
    { $group: { _id: '$from', total: { $sum: 1 }, replied: { $sum: { $cond: ['$replied', 1, 0] } } } },
    { $sort: { total: -1 } },
  ]);

  const initialByFrom = await Outbox.aggregate([
    { $match: { type: 'initial', status: 'sent' } },
    { $group: { _id: '$from', count: { $sum: 1 } } },
  ]);
  const followupByFrom = await Outbox.aggregate([
    { $match: { type: 'followup', status: 'sent' } },
    { $group: { _id: '$from', count: { $sum: 1 } } },
  ]);

  const initialMap = new Map(initialByFrom.map((x) => [x._id, x.count]));
  const followupMap = new Map(followupByFrom.map((x) => [x._id, x.count]));

  const byExecutive = campaignByFrom.map(({ _id: from, total, replied }) => {
    const email = from || '(unknown)';
    const rate = total ? ((replied / total) * 100).toFixed(1) : '0';
    return {
      email,
      displayName: configAccounts.find((a) => (a.email || '').toLowerCase() === (email || '').toLowerCase())?.displayName || null,
      hasLogin: configuredEmails.has((email || '').toLowerCase()),
      totalCampaigns: total,
      totalReplied: replied,
      responseRatePct: rate,
      initialSent: initialMap.get(email) || 0,
      followupSent: followupMap.get(email) || 0,
      totalEmailsSent: (initialMap.get(email) || 0) + (followupMap.get(email) || 0),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    overview,
    byExecutive,
    configAccountCount: configAccounts.length,
  };

  const outPath = process.argv[2] || path.join(process.cwd(), 'presentation-data.json');
  const fs = await import('fs');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('Report written to:', outPath);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
