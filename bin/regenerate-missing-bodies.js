#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Outbox } from '../src/models/Outbox.js';
import { Campaign } from '../src/models/Campaign.js';
import { getTemplateForCampaign } from '../src/services/campaignDbService.js';
import { getAccountDisplayName } from '../src/services/gmailService.js';

async function main() {
  await connectMongo();

  console.log('🔄 Auto-regenerating missing email bodies...\n');

  // Find all emails with missing body that are pending or sending
  const missingBody = await Outbox.find({
    status: { $in: ['pending', 'sending'] },
    $or: [
      { body: { $exists: false } },
      { body: null },
      { body: '' }
    ]
  }).lean();

  if (missingBody.length === 0) {
    console.log('✅ No emails with missing bodies found');
    process.exit(0);
  }

  console.log(`Found ${missingBody.length} emails with missing body\n`);

  let regenerated = 0;
  let failed = 0;
  const errors = [];

  for (const job of missingBody) {
    try {
      let campaignName = null;
      let recipientName = '';
      let touchpoint = null;

      // Get campaign name
      if (job.campaignRef?.campaignName) {
        campaignName = job.campaignRef.campaignName;
        recipientName = job.campaignRef.recipientName || '';
      } else if (job.campaignRef?.campaignId) {
        const campaign = await Campaign.findById(job.campaignRef.campaignId).lean();
        if (campaign) {
          campaignName = campaign.campaignName;
          recipientName = campaign.recipientName || '';
          touchpoint = campaign.touchpoint || 1;
        }
      }

      if (!campaignName) {
        failed++;
        errors.push(`${job.to}: No campaign name found`);
        continue;
      }

      // Get template
      const tpl = await getTemplateForCampaign(campaignName);
      if (!tpl) {
        failed++;
        errors.push(`${job.to}: Template not found for campaign: ${campaignName}`);
        continue;
      }

      let emailBody = null;

      if (job.type === 'initial') {
        // Use touchpoint 1
        const templatesMap = tpl.templates instanceof Map 
          ? Object.fromEntries(tpl.templates) 
          : tpl.templates || {};
        
        const firstTouchKeys = Object.keys(templatesMap)
          .filter((key) => key.toString().toLowerCase().startsWith('1'))
          .sort();
        
        if (firstTouchKeys.length === 0) {
          failed++;
          errors.push(`${job.to}: No touchpoint 1 templates found`);
          continue;
        }
        
        const chosenKey = firstTouchKeys[Math.floor(Math.random() * firstTouchKeys.length)];
        emailBody = templatesMap[chosenKey];
      } else if (job.type === 'followup' && job.campaignRef?.campaignId) {
        // Use next touchpoint
        const campaign = await Campaign.findById(job.campaignRef.campaignId).lean();
        if (campaign) {
          const nextTouch = Math.min(7, (campaign.touchpoint || 1) + 1);
          const templatesMap = tpl.templates instanceof Map 
            ? Object.fromEntries(tpl.templates) 
            : tpl.templates || {};
          emailBody = templatesMap[nextTouch];
        }
      }

      if (!emailBody) {
        failed++;
        errors.push(`${job.to}: Could not determine template`);
        continue;
      }

      // Replace placeholders
      if (recipientName) {
        // Clean up recipient name (remove "Dear" prefix if present)
        let cleanName = recipientName;
        if (cleanName.includes(',')) {
          cleanName = cleanName.split(',')[0].trim();
        }
        if (cleanName.toLowerCase().startsWith('dear')) {
          cleanName = cleanName.replace(/^dear\s+/i, '').trim();
        }
        emailBody = emailBody.replace(/{recipientName}/gi, cleanName);
      } else {
        emailBody = emailBody.replace(/Dear\s+{recipientName},/gi, 'Hello,');
        emailBody = emailBody.replace(/{recipientName}/gi, '');
      }
      const senderName = getAccountDisplayName(job.from) || '';
      emailBody = emailBody.replace(/{senderName}/g, senderName);

      // Save regenerated body
      await Outbox.findByIdAndUpdate(job._id, {
        $set: { body: emailBody },
        $unset: { lastError: '' }
      });

      regenerated++;
    } catch (error) {
      failed++;
      errors.push(`${job.to}: ${error.message}`);
    }
  }

  console.log(`✅ Regenerated: ${regenerated} emails`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed} emails`);
    if (errors.length <= 10) {
      errors.forEach(e => console.log(`   ${e}`));
    } else {
      console.log(`   (showing first 10 errors)`);
      errors.slice(0, 10).forEach(e => console.log(`   ${e}`));
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

