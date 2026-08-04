#!/usr/bin/env node
/**
 * Remove pending/sending outbox jobs for accounts not in config.json.
 *
 * Usage:
 *   node scripts/cleanup-unconfigured-outbox.js           # dry-run
 *   node scripts/cleanup-unconfigured-outbox.js --confirm # delete
 */
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const confirm = process.argv.includes('--confirm');

function loadConfiguredEmails() {
  const config = JSON.parse(readFileSync(join(__dirname, '../config.json'), 'utf8'));
  return new Set((config.accounts || []).map((a) => a.email.toLowerCase()));
}

async function main() {
  const configured = loadConfiguredEmails();
  await connectMongo();

  const pending = await Outbox.find({
    status: { $in: ['pending', 'sending'] },
  })
    .select('from status type')
    .lean();

  const orphans = pending.filter((j) => !configured.has((j.from || '').toLowerCase()));

  const byAccount = {};
  for (const j of orphans) {
    byAccount[j.from] = byAccount[j.from] || { pending: 0, sending: 0, total: 0 };
    byAccount[j.from][j.status] = (byAccount[j.from][j.status] || 0) + 1;
    byAccount[j.from].total += 1;
  }

  console.log('🧹 Unconfigured account outbox cleanup\n');
  console.log(`Configured accounts: ${configured.size}`);
  console.log(`Orphan jobs (pending/sending): ${orphans.length}\n`);

  if (orphans.length === 0) {
    console.log('✅ Nothing to clean up.');
    process.exit(0);
  }

  Object.entries(byAccount)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([email, counts]) => {
      console.log(`  ${email}: ${counts.total} (pending ${counts.pending || 0}, sending ${counts.sending || 0})`);
    });

  if (!confirm) {
    console.log('\n💡 Dry run only. Re-run with --confirm to delete these jobs.');
    process.exit(0);
  }

  const orphanFroms = Object.keys(byAccount);
  const result = await Outbox.deleteMany({
    status: { $in: ['pending', 'sending'] },
    from: { $in: orphanFroms },
  });

  console.log(`\n✅ Deleted ${result.deletedCount} orphan outbox job(s).`);

  const remainingPending = await Outbox.countDocuments({ status: 'pending' });
  const configuredPending = await Outbox.countDocuments({
    status: 'pending',
    from: { $in: [...configured] },
  });
  console.log(`Remaining pending (all): ${remainingPending}`);
  console.log(`Remaining pending (configured accounts): ${configuredPending}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
