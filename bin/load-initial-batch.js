#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
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
  let queued = 0, failed = 0;

  // Compute notBefore ONCE for all emails (unless window is specified)
  // This ensures all emails are queued with the same timestamp
  const baseNotBefore = windowSpec ? computeRandomNotBefore(windowSpec) : new Date();
  const templateCache = new Map();

  for (const row of contacts) {
    try {
      const { email, name = '', recipientName = '', from, campaignName } = row || {};
      if (!email || !from || !campaignName) throw new Error('Missing email/from/campaignName');
      if (!configured.has(from)) throw new Error(`Owner not in config.json: ${from}`);

      // Use recipientName if provided, otherwise fall back to name
      let finalRecipientName = recipientName || name;
      // Extract just the name part if recipientName contains comma (format: "Name, Dear Name")
      if (finalRecipientName && finalRecipientName.includes(',')) {
        finalRecipientName = finalRecipientName.split(',')[0].trim();
      }
      // Normalize: trim whitespace and ensure it's not empty
      finalRecipientName = finalRecipientName ? finalRecipientName.trim() : '';

      let meta = templateCache.get(campaignName);
      if (!meta) {
        const campaignTemplate = await getTemplateForCampaign(campaignName);
        const templatesMap =
          campaignTemplate?.templates instanceof Map
            ? Object.fromEntries(campaignTemplate.templates)
            : campaignTemplate?.templates || {};
        const subjectMap =
          campaignTemplate?.subjectLines instanceof Map
            ? Object.fromEntries(campaignTemplate.subjectLines)
            : campaignTemplate?.subjectLines || {};
        const firstTouchKeys = Object.keys(templatesMap)
          .filter((key) => key.toLowerCase().startsWith('1'))
          .sort();
        if (!firstTouchKeys.length) throw new Error('No touchpoint 1 templates configured');
        meta = {
          templatesMap,
          subjectMap,
          firstTouchKeys,
        };
        templateCache.set(campaignName, meta);
      }
      const { templatesMap, subjectMap, firstTouchKeys } = meta;
      const chosenKey = firstTouchKeys[Math.floor(Math.random() * firstTouchKeys.length)];
      const subject = subjectMap[chosenKey] ?? subjectMap[firstTouchKeys[0]] ?? ' ';
      let body = templatesMap[chosenKey];

      // Fill placeholders
      const senderName = getAccountDisplayName(from) || '';
      if (finalRecipientName) {
        // Use case-insensitive replace to handle any casing issues
        body = body.replace(/{recipientName}/gi, finalRecipientName);
      } else {
        // If no name, replace "Dear {recipientName}," with "Hello,"
        body = body.replace(/Dear\s+{recipientName},/gi, 'Hello,');
        // Remove any remaining {recipientName} placeholders
        body = body.replace(/{recipientName}/gi, '');
      }
      body = body.replace(/{senderName}/gi, senderName);

      // Use the same notBefore for all emails (unless window is specified)
      const notBefore = windowSpec ? computeRandomNotBefore(windowSpec) : baseNotBefore;
      await enqueueInitial({ from, to: email, subject, body, campaignName, recipientName: finalRecipientName, notBefore });
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


