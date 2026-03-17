#!/usr/bin/env node
/**
 * Remove a contact (and their campaign/outbox records) from the database.
 * Usage: node bin/remove-contact.js <email>
 * Example: node bin/remove-contact.js himanshu@khushii.org
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node bin/remove-contact.js <email>');
    process.exit(1);
  }

  // Normalize: "himanshu.khushi.org" likely means "himanshu@khushii.org"
  let searchEmail = email.toLowerCase();
  if (!searchEmail.includes('@') && searchEmail.includes('.')) {
    const parts = searchEmail.split('.');
    if (parts.length >= 2) searchEmail = `${parts[0]}@${parts.slice(1).join('.')}`;
  }

  await connectMongo();

  const campaignResult = await Campaign.deleteMany({ to: searchEmail });
  const outboxResult = await Outbox.deleteMany({ to: searchEmail });

  console.log(`Deleted ${campaignResult.deletedCount} campaign(s) and ${outboxResult.deletedCount} outbox job(s) for ${searchEmail}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
