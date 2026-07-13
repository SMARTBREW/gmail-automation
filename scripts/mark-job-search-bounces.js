#!/usr/bin/env node
/**
 * Mark Job Search campaigns as bounced and cancel pending follow-ups.
 * Usage:
 *   node scripts/mark-job-search-bounces.js
 *   node scripts/mark-job-search-bounces.js email1@x.com email2@y.com --reason "Address not found"
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';
import { JOB_SEARCH_CAMPAIGN } from '../src/services/personalCampaignConfig.js';
import { markBounced } from '../src/services/campaignDbService.js';

const DEFAULT_BOUNCES = [
  { email: 'chandrali@aisensy.com', reason: 'Address not found' },
  { email: 'sunit.kanoi@ag-technologies.com', reason: 'Address not found' },
  { email: 'eustine.thomas@ars-traffic.com', reason: 'Address not found' },
  { email: 'swapnil.pilkhane@aqmtechnologies.com', reason: 'Address not found' },
  { email: 'renu.srivastava@agdata.com', reason: 'Address not found' },
  { email: 'roopali@aitglobalinc.com', reason: 'Message blocked' },
  { email: 'sapana.suresh@trizetto.com', reason: 'Delivery failure' },
];

async function cancelFollowups(campaignId) {
  return Outbox.updateMany(
    {
      type: 'followup',
      status: { $in: ['pending', 'sending'] },
      'campaignRef.campaignId': campaignId,
    },
    {
      $set: { status: 'sent' },
      $unset: { body: '' },
    },
  );
}

async function main() {
  await connectMongo();

  const reasonFlagIdx = process.argv.indexOf('--reason');
  const cliReason =
    reasonFlagIdx >= 0 ? process.argv[reasonFlagIdx + 1] || 'Delivery failure' : '';
  const cliEmails = process.argv
    .slice(2)
    .filter((a) => a.includes('@') && !a.startsWith('--'))
    .map((e) => e.toLowerCase().trim());

  const targets = cliEmails.length
    ? cliEmails.map((email) => ({ email, reason: cliReason || 'Delivery failure' }))
    : DEFAULT_BOUNCES;

  let marked = 0;
  let missing = 0;
  let cancelled = 0;

  console.log(`Marking ${targets.length} Job Search bounce(s)...\n`);

  for (const { email, reason } of targets) {
    const campaign = await Campaign.findOne({
      campaignName: JOB_SEARCH_CAMPAIGN,
      to: email,
    });

    if (!campaign) {
      missing++;
      console.log(`❓ not found: ${email}`);
      continue;
    }

    await markBounced({ campaignId: campaign._id, reason });
    const result = await cancelFollowups(campaign._id);
    cancelled += result.modifiedCount || 0;
    marked++;
    console.log(`🚫 bounced: ${email} (${reason}) — cancelled ${result.modifiedCount || 0} follow-up(s)`);
  }

  console.log(`\nDone. marked=${marked}, missing=${missing}, followupsCancelled=${cancelled}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
