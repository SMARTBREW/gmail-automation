#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

async function main() {
  await connectMongo();

  const campaigns = await Campaign.find({})
    .select('from replied touchpoint')
    .lean();

  const stats = {};

  for (const c of campaigns) {
    const from = c.from || '(no from)';
    const tp = c.touchpoint || 1;
    if (!stats[from]) stats[from] = { total: 0, replied: 0, byTp: {} };
    stats[from].total += 1;
    if (c.replied) {
      stats[from].replied += 1;
      stats[from].byTp[tp] = (stats[from].byTp[tp] || 0) + 1;
    }
  }

  console.log('Per-account totals and reply distribution by touchpoint:\n');
  Object.entries(stats)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([from, s]) => {
      const rate = s.total ? ((s.replied * 100) / s.total).toFixed(1) : '0.0';
      const tpParts = Object.entries(s.byTp)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([tp, n]) => `TP${tp}: ${n}`)
        .join(', ');
      console.log(
        `${from} -> sent: ${s.total}, replied: ${s.replied} (${rate}%)` +
          (tpParts ? ` | replies by TP: ${tpParts}` : '')
      );
    });
}

main().catch((err) => {
  console.error('Error computing stats:', err.message || err);
  process.exit(1);
});

