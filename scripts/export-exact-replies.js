#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { getAccountByEmail, getGmailClient } from '../src/services/gmailService.js';

const from = process.argv[2];
const emails = process.argv.slice(3);

function decodePart(part) {
  if (!part?.body?.data) return '';
  return Buffer.from(part.body.data, 'base64url').toString('utf8');
}

function collectPlain(payload, out = []) {
  if (!payload) return out;
  if (payload.mimeType === 'text/plain' && payload.body?.data) out.push(decodePart(payload));
  for (const part of payload.parts || []) collectPlain(part, out);
  return out;
}

function stripQuoted(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (/^On .+ wrote:$/i.test(trimmed)) break;
    if (/^On .+, .+ wrote:$/i.test(trimmed)) break;
    if (/^> On .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+ at .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+, .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+ \d{4}, at .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+ \d{4}, at .+ .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+ \d{4}, at .+ PM, .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+ \d{4}, at .+ AM, .+ wrote:$/i.test(trimmed)) break;
    kept.push(line);
  }
  return kept.join('\n').trimEnd();
}

function normalizeEmail(fromHeader) {
  if (!fromHeader) return '';
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

async function main() {
  await connectMongo();
  const account = getAccountByEmail(from);
  const gmail = getGmailClient(account.email, account.refreshToken);

  for (const to of emails) {
    const campaign = await Campaign.findOne({ from, to, replied: true }).sort({ updatedAt: -1 }).lean();
    console.log(`### ${to}`);
    if (!campaign?.threadId) {
      console.log('NOT_FOUND');
      continue;
    }

    const thread = await gmail.users.threads.get({ userId: 'me', id: campaign.threadId, format: 'full' });
    const messages = thread.data.messages || [];
    let replyText = null;

    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      const message = messages[idx];
      const headers = Object.fromEntries((message.payload?.headers || []).map((h) => [h.name, h.value]));
      const fromAddr = normalizeEmail(headers.From || '');
      const autoSubmitted = (headers['Auto-Submitted'] || '').toLowerCase();
      const precedence = (headers['Precedence'] || '').toLowerCase();

      if (fromAddr.includes(from.toLowerCase())) continue;
      if (autoSubmitted && autoSubmitted !== 'no') continue;
      if (precedence && (precedence.includes('bulk') || precedence.includes('junk') || precedence.includes('auto_reply'))) continue;
      if (!fromAddr) continue;

      const plain = collectPlain(message.payload);
      replyText = stripQuoted(plain[0] || plain.join('\n\n'));
      break;
    }

    console.log(replyText || 'NO_REPLY_TEXT');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
