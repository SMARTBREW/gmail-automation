#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { campaignsReadyForFollowup, getTemplateForCampaign } from '../src/services/campaignDbService.js';
import { enqueueFollowup } from '../src/services/queueService.js';
import { getAccountDisplayName, checkThreadForReply } from '../src/services/gmailService.js';

function ensureAngle(id) {
  if (!id) return '';
  return id.startsWith('<') ? id : `<${id}>`;
}

async function main() {
  await connectMongo();

  const testMode = process.env.TEST_MODE === 'true' ? true : false;
  const ready = await campaignsReadyForFollowup(testMode);
  let queued = 0, skipped = 0, errors = 0;

  for (const c of ready) {
    try {
      // Skip if replied
      const replied = await checkThreadForReply({
        fromEmail: c.from,
        threadId: c.threadId,
        recipientEmail: c.to,
      });
      if (replied) { skipped++; continue; }

      const nextTouch = Math.min(7, (c.touchpoint || 1) + 1);
      const tpl = await getTemplateForCampaign(c.campaignName);
      const templateBody = tpl.templates[nextTouch];
      const templateSubject = tpl.subjectLines[nextTouch];
      if (!templateBody) { skipped++; continue; }

      // Fill body minimally (Hello + sender)
      let body = templateBody.replace(/Dear {recipientName},/g, 'Hello,').replace(/{recipientName}/g, '');
      const senderName = c.displayName || getAccountDisplayName(c.from) || '';
      body = body.replace(/{senderName}/g, senderName);

      const subject = `Re: ${c.subject || templateSubject || ''}`;

      const firstMessageId = c.internetMessageId || (Array.isArray(c.messageIds) ? c.messageIds[0] : '');
      if (!firstMessageId) { skipped++; continue; }
      const inReplyTo = ensureAngle(firstMessageId);
      const all = c.allInternetMessageIds && c.allInternetMessageIds.length ? c.allInternetMessageIds : [firstMessageId];
      const references = all.map(ensureAngle).join(' ');

      await enqueueFollowup({
        from: c.from,
        to: c.to,
        subject,
        body,
        headers: { threadId: c.threadId, inReplyTo, references },
        campaignId: c._id,
        originalSubject: c.subject,
      });
      queued++;
      console.log(`✅ queued TP${nextTouch} to ${c.to} from ${c.from}`);
    } catch (e) {
      errors++;
      console.error(`❌ ${c.to}: ${e.message}`);
    }
  }
  console.log(`\nSummary: queued=${queued}, skipped=${skipped}, errors=${errors}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


