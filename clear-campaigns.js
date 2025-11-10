import { connectMongo } from './src/db/mongo.js';
import { Campaign } from './src/models/Campaign.js';

await connectMongo();
await Campaign.deleteMany({});
console.log('✅ All campaigns cleared from database');
process.exit(0);
