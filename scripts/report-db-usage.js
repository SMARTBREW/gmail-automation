import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { connectMongo } from '../src/db/mongo.js';

dotenv.config();

async function main() {
  await connectMongo();
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  console.log('📊 Collection Statistics (estimated via $bsonSize)\n');

  for (const { name } of collections) {
    const collection = db.collection(name);
    const [{ count = 0, size = 0 } = {}] = await collection
      .aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            size: { $sum: { $bsonSize: '$$ROOT' } },
          },
        },
      ])
      .toArray();

    const sizeMb = size / (1024 * 1024);
    const avgKb = count ? size / count / 1024 : 0;
    console.log(`${name}`);
    console.log(`  count        : ${count}`);
    console.log(`  est size     : ${sizeMb.toFixed(2)} MB`);
    console.log(`  avg doc size : ${avgKb.toFixed(2)} KB`);
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error reporting collection stats:', err.message || err);
  process.exit(1);
});
