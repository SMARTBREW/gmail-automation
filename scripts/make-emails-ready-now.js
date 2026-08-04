#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { staggerPendingJobs } from '../src/services/queueService.js';

async function main() {
  await connectMongo();

  const now = new Date();
  const typeArg = process.argv.find((a) => a.startsWith('--type='));
  const type = typeArg ? typeArg.split('=')[1] : 'initial';

  console.log('Preparing pending emails to send...');
  console.log('Current time:', now.toLocaleString());

  const count = await staggerPendingJobs({
    type: type === 'all' ? null : type,
    baseTime: now,
  });

  console.log(`✅ Prepared ${count} pending email(s) with per-account stagger`);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
