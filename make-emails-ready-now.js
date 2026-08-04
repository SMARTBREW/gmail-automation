#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from './src/db/mongo.js';
import { staggerPendingJobs } from './src/services/queueService.js';

async function main() {
  await connectMongo();

  const now = new Date();
  const typeArg = process.argv.find((a) => a.startsWith('--type='));
  const type = typeArg ? typeArg.split('=')[1] : 'initial';
  const stagger = !process.argv.includes('--no-stagger');

  console.log('Preparing pending emails to send...');
  console.log('Current time:', now.toLocaleString());
  console.log(`Type filter: ${type || 'all'}, stagger: ${stagger}`);

  const count = await staggerPendingJobs({
    type: type === 'all' ? null : type,
    baseTime: now,
  });

  console.log(`✅ Prepared ${count} pending email(s) with${stagger ? '' : 'out'} per-account stagger`);
  if (stagger) {
    console.log('   Each sender sends ~1 email every 4–6 minutes in order.');
  }
  console.log('\nMake sure exactly one worker is running (EC2 PM2 preferred).');

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
