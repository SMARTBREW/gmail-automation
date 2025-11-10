#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { connectMongo } from '../src/db/mongo.js';
import { getTemplateForCampaign } from '../src/services/campaignDbService.js';
import { enqueueInitial } from '../src/services/queueService.js';
import { getAccountDisplayName, getConfiguredAccounts } from '../src/services/gmailService.js';

function usage() {
  console.log('Usage: node bin/load-initial-batch.js <contacts.json> [--window 10:00-10:30]');
}

function parseWindow(arg) {
  if (!arg) return null;
  const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(arg);
  if (!m) return null;
  const [ , h1, m1, h2, m2 ] = m.map(Number);
  return { startH: h1, startM: m1, endH: h2, endM: m2 };
}

function computeRandomNotBefore(windowSpec) {
  if (!windowSpec) return new Date();
  const now = new Date();
  const start = new Date(now);
  start.setHours(windowSpec.startH, windowSpec.startM, 0, 0);
  const end = new Date(now);
  end.setHours(windowSpec.endH, windowSpec.endM, 0, 0);
  // If window already passed today, schedule for tomorrow at start
  if (now > end) {
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
  }
  const spanMs = end.getTime() - start.getTime();
  const offset = Math.floor(Math.random() * Math.max(spanMs, 1));
  return new Date(start.getTime() + offset);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) { usage(); process.exit(1); }
  const filePath = path.resolve(process.cwd(), args[0]);
  const windowIdx = args.indexOf('--window');
  const windowSpec = windowIdx >= 0 ? parseWindow(args[windowIdx + 1]) : null;

  await connectMongo();

  const raw = readFileSync(filePath, 'utf8');
  const contacts = JSON.parse(raw);
  if (!Array.isArray(contacts)) {
    console.error('Contacts file must be an array of { email, name?, from, campaignName }');
    process.exit(1);
  }

  const configured = new Set(getConfiguredAccounts());
  // Try to load footer image from public folder
  let footerImgHtml = '';
  try {
    const pngPath = path.resolve(process.cwd(), 'public', 'WoH 2.png');
    if (existsSync(pngPath)) {
      const b64 = readFileSync(pngPath).toString('base64');
      footerImgHtml = `<p style="margin:0;padding:0"><img src="data:image/png;base64,${b64}" alt="Wings of Hope" style="max-width:600px;width:100%;height:auto;display:block;border:0;outline:none;text-decoration:none"/></p>`;
    }
  } catch {}
  let queued = 0, failed = 0;

  for (const row of contacts) {
    try {
      const { email, name = '', from, campaignName } = row || {};
      if (!email || !from || !campaignName) throw new Error('Missing email/from/campaignName');
      if (!configured.has(from)) throw new Error(`Owner not in config.json: ${from}`);

      const template = await getTemplateForCampaign(campaignName);
      const subject = template.subjectLines?.['1'] || template.subjectLines?.[1] || ' ';
      let body = template.templates?.['1'] || template.templates?.[1];
      if (!body) throw new Error('Template body for touchpoint 1 not found');

      // Fill placeholders
      const senderName = getAccountDisplayName(from) || '';
      if (name) {
        body = body.replace(/{recipientName}/g, name);
      } else {
        body = body.replace(/Dear {recipientName},/g, 'Hello,');
        body = body.replace(/{recipientName}/g, '');
      }
      body = body.replace(/{senderName}/g, senderName);
      // Only initial mail: append image after About us block (or simply at the end if About us is absent)
      if (footerImgHtml) {
        body = `${body}\n${footerImgHtml}`;
      }

      const notBefore = computeRandomNotBefore(windowSpec);
      await enqueueInitial({ from, to: email, subject, body, campaignName, notBefore });
      queued++;
      console.log(`✅ queued: ${email} from ${from} at ~${notBefore.toLocaleTimeString()}`);
    } catch (e) {
      failed++;
      console.error(`❌ ${row?.email || 'unknown'}: ${e.message}`);
    }
  }

  console.log(`\nSummary: queued=${queued}, failed=${failed}`);
  process.exit(queued > 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });


