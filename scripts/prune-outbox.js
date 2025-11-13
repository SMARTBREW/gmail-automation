import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

dotenv.config();

function parseDaysArg() {
  const idx = process.argv.indexOf('--days');
  if (idx === -1 || !process.argv[idx + 1]) {
    return 7; // default 7 days
  }
  const parsed = Number(process.argv[idx + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

async function main() {
  const days = parseDaysArg();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  await connectMongo();

  const query = {
    status: { $in: ['sent', 'failed'] },
    updatedAt: { $lte: cutoff },
  };

  const total = await Outbox.countDocuments(query);
  console.log(`Found ${total} outbox records older than ${days} day(s) with status sent/failed.`);

  if (total === 0) {
    await mongoose.disconnect();
    return;
  }

  const result = await Outbox.deleteMany(query);
  console.log(`Deleted ${result.deletedCount} outbox documents.`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error pruning outbox:', err.message || err);
  process.exit(1);
});
