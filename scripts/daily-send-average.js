#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';
import mongoose from '../src/db/mongo.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAYS = 14;

function getIstDayBounds(referenceDate, dayOffset = 0) {
  const shifted = new Date(referenceDate.getTime() + IST_OFFSET_MS);
  const dayBase = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
  dayBase.setUTCDate(dayBase.getUTCDate() + dayOffset);
  const startUtc =
    Date.UTC(
      dayBase.getUTCFullYear(),
      dayBase.getUTCMonth(),
      dayBase.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - IST_OFFSET_MS;
  const endUtc = startUtc + 24 * 60 * 60 * 1000;
  const labelDate = new Date(startUtc + IST_OFFSET_MS);
  return {
    start: new Date(startUtc),
    end: new Date(endUtc),
    label: labelDate.toISOString().slice(0, 10),
  };
}

async function main() {
  await connectMongo();

  const now = new Date();
  const daily = [];

  for (let offset = -DAYS; offset < 0; offset += 1) {
    const bounds = getIstDayBounds(now, offset);
    const sent = await Outbox.find({
      status: 'sent',
      updatedAt: { $gte: bounds.start, $lt: bounds.end },
    })
      .select('type')
      .lean();

    const initial = sent.filter((j) => j.type === 'initial').length;
    const followup = sent.filter((j) => j.type === 'followup').length;
    daily.push({
      date: bounds.label,
      total: sent.length,
      initial,
      followup,
    });
  }

  const totals = daily.reduce(
    (acc, d) => {
      acc.total += d.total;
      acc.initial += d.initial;
      acc.followup += d.followup;
      return acc;
    },
    { total: 0, initial: 0, followup: 0 },
  );

  const n = daily.length;
  const avg = {
    total: (totals.total / n).toFixed(1),
    initial: (totals.initial / n).toFixed(1),
    followup: (totals.followup / n).toFixed(1),
  };

  console.log(`Daily sends (IST) — past ${DAYS} days\n`);
  console.log('Date       | Total | Initial | Follow-up');
  console.log('-----------|-------|---------|----------');
  for (const d of daily) {
    console.log(
      `${d.date} | ${String(d.total).padStart(5)} | ${String(d.initial).padStart(7)} | ${String(d.followup).padStart(9)}`,
    );
  }
  console.log('-----------|-------|---------|----------');
  console.log(
    `Average    | ${String(avg.total).padStart(5)} | ${String(avg.initial).padStart(7)} | ${String(avg.followup).padStart(9)}`,
  );
  console.log(`\nTotal sent in period: ${totals.total} (${totals.initial} initial + ${totals.followup} follow-ups)`);

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
