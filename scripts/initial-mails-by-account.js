#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  await connectMongo();

  const total = await Outbox.countDocuments({ type: 'initial', status: 'sent' });
  const byAccount = await Outbox.aggregate([
    { $match: { type: 'initial', status: 'sent' } },
    { $group: { _id: '$from', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log('📧 First (initial) emails sent\n');
  console.log(`Total: ${total}\n`);
  console.log('By account:');
  byAccount.forEach(({ _id, count }) => {
    console.log(`   ${_id}: ${count}`);
  });

  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
