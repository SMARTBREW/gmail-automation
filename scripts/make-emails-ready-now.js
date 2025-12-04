#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';

async function main() {
  await connectMongo();
  
  const now = new Date();
  const result = await Outbox.updateMany(
    {
      type: 'followup',
      status: 'pending',
      notBefore: { $gt: now } // Only update future-scheduled emails
    },
    {
      $set: { notBefore: now }
    }
  );
  
  console.log(`✅ Updated ${result.modifiedCount} follow-up emails to send immediately`);
  console.log(`   They will be processed by the outbox worker on the next cycle`);
  
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});

