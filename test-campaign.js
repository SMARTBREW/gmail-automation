import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from './src/db/mongo.js';
import { sendEmail, getNextAccount, getAccountDisplayName } from './src/services/gmailService.js';
import { createCampaignRecord, campaignsReadyForFollowup, advanceTouchpoint } from './src/services/campaignDbService.js';
import { generateFollowUp } from './src/services/openAIService.js';
import { getThreadSummary, checkThreadForReply } from './src/services/gmailService.js';

await connectMongo();

const TEST_CONTACTS = [
  // Provide per-contact owner (from) to enforce sending from the correct Gmail
  { email: 'smartbrew11@gmail.com', name: 'smartbreww', from: 'iamayushanand365@gmail.com' },
  { email: 'rrrajveer424@gmail.com', name: 'ayush',       from: 'h3yayush@gmail.com' },
];
const CAMPAIGN_NAME = 'Wings of Hope';
const SUBJECT = 'Your Voice Can Bring Hope';

// Template function that replaces placeholders with actual names
function fillTemplate(template, recipientName, senderName) {
  let filled = template;
  
  // Replace recipient name - if empty, use "Hello," instead of "Dear ,"
  if (recipientName) {
    filled = filled.replace(/{recipientName}/g, recipientName);
  } else {
    filled = filled.replace(/Dear {recipientName},/g, 'Hello,');
    filled = filled.replace(/{recipientName}/g, '');
  }
  
  // Replace sender name
  filled = filled.replace(/{senderName}/g, senderName);
  
  return filled;
}

// Get template for specific touchpoint
async function getEmailTemplate(campaignName, touchpoint) {
  const { getTemplateForCampaign } = await import('./src/services/campaignDbService.js');
  try {
    const template = await getTemplateForCampaign(campaignName);
    return {
      body: template.templates[touchpoint],
      subject: template.subjectLines[touchpoint],
    };
  } catch (error) {
    console.error(`❌ Error loading template: ${error.message}`);
    throw error;
  }
}

async function sendInitialEmails() {
  console.log('📧 Sending touchpoint 1 (initial emails)...\n');

  for (const contact of TEST_CONTACTS) {
    try {
      // Use per-contact owner email (required)
      const fromEmail = contact.from;
      if (!fromEmail) {
        throw new Error(`No 'from' (owner email) specified for contact ${contact.email}`);
      }
      const displayName = getAccountDisplayName(fromEmail);
      if (!displayName) {
        throw new Error(`Owner email ${fromEmail} not found in config.json`);
      }
      const to = contact.email;
      const recipientName = contact.name || '';
      
      console.log(`  → Sending to ${to}${recipientName ? ` (${recipientName})` : ''}...`);
      
      // Get template for touchpoint 1
      const { body: templateBody, subject: templateSubject } = await getEmailTemplate(CAMPAIGN_NAME, 1);
      const emailBody = fillTemplate(templateBody, recipientName, displayName);
      
      const result = await sendEmail(fromEmail, to, templateSubject, emailBody);
      
        await createCampaignRecord({
        campaignName: CAMPAIGN_NAME,
        to,
        from: fromEmail,
        displayName,
        subject: templateSubject,
        originalEmailBody: emailBody,
        threadId: result.threadId,
        messageId: result.messageId,
        internetMessageId: result.internetMessageId,
      });
      
      console.log(`  ✅ Sent! Message ID: ${result.messageId}\n`);
    } catch (error) {
      console.error(`  ❌ Error sending to ${to}:`, error.message);
    }
  }
}

async function sendFollowUps() {
  console.log('📨 Sending follow-ups (touchpoints 2-7) with 1-minute gaps...\n');
  
  for (let touchpoint = 2; touchpoint <= 7; touchpoint++) {
    console.log(`\n⏰ Waiting 1 minute before touchpoint ${touchpoint}...`);
    await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // 1 minute
    
    const ready = await campaignsReadyForFollowup(true); // Test mode: 1-minute gaps
    
    if (ready.length === 0) {
      console.log(`  ⚠️  No campaigns ready for touchpoint ${touchpoint}`);
      continue;
    }
    
    console.log(`  📊 Found ${ready.length} campaigns ready for touchpoint ${touchpoint}`);
    
    for (const campaign of ready) {
      try {
        // Check if already replied
        const replied = await checkThreadForReply({
          fromEmail: campaign.from,
          threadId: campaign.threadId,
          recipientEmail: campaign.to,
        });
        
        if (replied) {
          console.log(`  ✅ ${campaign.to} already replied - skipping`);
          continue;
        }
        
        // Generate follow-up
        const summary = await getThreadSummary({
          fromEmail: campaign.from,
          threadId: campaign.threadId,
        });
        
        // Extract recipient name from original email
        let recipientName = '';
        if (campaign.originalEmailBody) {
          const nameMatch = campaign.originalEmailBody.match(/(?:Dear|Hi|Hello)\s+([A-Za-z]+)/i);
          if (nameMatch && nameMatch[1]) {
            recipientName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
          }
        }
        
        // Get template for this touchpoint
        const { body: templateBody, subject: templateSubject } = await getEmailTemplate(CAMPAIGN_NAME, touchpoint);
        const body = fillTemplate(templateBody, recipientName, campaign.displayName || getAccountDisplayName(campaign.from));
        
        // CRITICAL: Use original subject with Re: prefix to maintain threading
        const subject = `Re: ${campaign.subject || templateSubject}`;
        
        // CRITICAL: Use the FIRST email's Message-ID for In-Reply-To
        // and ALL previous Message-IDs for References (proper RFC 2822 threading)
        const firstMessageId = campaign.internetMessageId || campaign.messageIds?.[0];
        if (!firstMessageId) {
          console.warn(`⚠️  No Internet Message-ID found for campaign ${campaign._id}, skipping follow-up`);
          continue;
        }
        
        // Build References header with ALL previous Message-IDs
        const allMessageIds = campaign.allInternetMessageIds || [firstMessageId];
        const referencesArray = allMessageIds.map(id => 
          id.startsWith('<') ? id : `<${id}>`
        );
        const references = referencesArray.join(' ');
        
        // In-Reply-To is always the first message ID
        const inReplyTo = firstMessageId.startsWith('<') ? firstMessageId : `<${firstMessageId}>`;
        
        // Send in the same thread using threadId + In-Reply-To/References headers
        const result = await sendEmail(campaign.from, campaign.to, subject, body, {
          threadId: campaign.threadId, // Gmail thread ID
          inReplyTo, // Internet Message-ID from first email
          references, // All previous Message-IDs in thread
        });
        
        console.log(`  📝 DEBUG: Returned internetMessageId: ${result.internetMessageId || 'MISSING!'}`);
        console.log(`  📝 DEBUG: References used: ${references}`);
        
        await advanceTouchpoint({
          campaignId: campaign._id,
          newBody: body,
          newMessageId: result.messageId,
          threadId: result.threadId,
          internetMessageId: result.internetMessageId, // Store this follow-up's Message-ID too
        });
        
        console.log(`  ✅ Sent touchpoint ${touchpoint} to ${campaign.to}`);
      } catch (error) {
        console.error(`  ❌ Error sending follow-up to ${campaign.to}:`, error.message);
      }
    }
  }
  
  console.log('\n✅ All follow-ups completed!');
}

async function main() {
  try {
    console.log('🚀 Starting campaign test...\n');
    console.log(`📋 Test contacts: ${TEST_CONTACTS.length} recipients`);
    console.log(`📝 Campaign: ${CAMPAIGN_NAME}\n`);
    
    // Step 1: Send initial emails
    await sendInitialEmails();
    
    // Step 2: Wait 1 minute before starting follow-ups
    console.log('\n⏰ Waiting 1 minute before starting follow-ups...\n');
    await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    
    // Step 3: Send follow-ups (touchpoints 2-7) with 1-minute gaps
    await sendFollowUps();
    
    console.log('\n🎉 Test completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();

