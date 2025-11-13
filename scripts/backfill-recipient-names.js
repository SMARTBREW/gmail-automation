import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { readFileSync } from 'fs';

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

dotenv.config();

async function main() {
  await connectMongo();

  // Load contacts.json to map emails to names
  let contacts = [];
  try {
    const contactsData = readFileSync('batches/contacts.json', 'utf8');
    contacts = JSON.parse(contactsData);
  } catch (err) {
    console.error('Error reading contacts.json:', err.message);
    process.exit(1);
  }

  // Create email -> name mapping
  const emailToName = new Map();
  for (const contact of contacts) {
    if (contact.email && contact.name) {
      emailToName.set(contact.email.toLowerCase(), contact.name);
    }
  }

  console.log(`Loaded ${emailToName.size} contacts from contacts.json`);

  // Find campaigns missing recipientName
  const campaigns = await Campaign.find({ 
    recipientName: { $exists: false } 
  }).lean();

  console.log(`Found ${campaigns.length} campaigns missing recipientName`);

  let updated = 0;
  for (const campaign of campaigns) {
    const email = campaign.to?.toLowerCase();
    if (email && emailToName.has(email)) {
      const name = emailToName.get(email);
      await Campaign.findByIdAndUpdate(campaign._id, { 
        $set: { recipientName: name } 
      });
      updated++;
    }
  }

  console.log(`✅ Updated ${updated} campaigns with recipientName`);
  console.log(`ℹ️  ${campaigns.length - updated} campaigns still missing recipientName (email not in contacts.json)`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error backfilling recipient names:', err.message || err);
  process.exit(1);
});

