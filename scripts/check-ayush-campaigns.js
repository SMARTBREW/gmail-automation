import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

await connectMongo();

const email = 'iamayushanand365@gmail.com';
const campaigns = await Campaign.find({ from: email }).lean();

console.log(`Campaigns sent from ${email}: ${campaigns.length}`);
console.log(`- Replied: ${campaigns.filter(c => c.replied).length}`);
console.log(`- Resume Clicked: ${campaigns.filter(c => c.resumeClickedAt).length}`);

console.log('\n--- Details of Clicked/Replied Campaigns ---');
for (const c of campaigns) {
  if (c.replied || c.resumeClickedAt) {
    console.log(`To: ${c.to}`);
    console.log(`Company: ${c.company}`);
    console.log(`Replied: ${c.replied ? 'Yes' : 'No'}`);
    console.log(`Clicked Resume: ${c.resumeClickedAt ? c.resumeClickedAt.toLocaleString() : 'No'}`);
    console.log(`Touchpoint: ${c.touchpoint}`);
    console.log(`Last Sent: ${c.lastSent ? c.lastSent.toLocaleString() : 'N/A'}`);
    console.log('-'.repeat(40));
  }
}

process.exit(0);
