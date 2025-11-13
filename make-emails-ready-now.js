#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from './src/db/mongo.js';
import { Outbox } from './src/models/Outbox.js';

async function main() {
  await connectMongo();
  
  const now = new Date();
  console.log('Updating all pending emails to be ready now...');
  console.log('Current time:', now.toLocaleString());
  
  const result = await Outbox.updateMany(
    { status: 'pending' },
    { $set: { notBefore: now } }
  );
  
  console.log(`✅ Updated ${result.modifiedCount} emails to be ready now`);
  console.log(`\nNow make sure your deployed server is running to process them!`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

