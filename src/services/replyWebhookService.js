/**
 * Gmail Reply Webhook Service
 * 
 * This service sets up Gmail Push Notifications to detect replies in real-time.
 * When a reply is received, it immediately marks the campaign as replied and
 * cancels any pending follow-ups.
 * 
 * Setup:
 * 1. Create a Google Cloud Pub/Sub topic
 * 2. Set up a webhook endpoint to receive notifications
 * 3. Call watchGmail() to start watching for new messages
 * 4. Process notifications to detect replies
 */

import { google } from 'googleapis';
import { connectMongo } from '../db/mongo.js';
import { Campaign } from '../models/Campaign.js';
import { Outbox } from '../models/Outbox.js';
import { getAccountByEmail, getGmailClient } from './gmailService.js';
import { checkThreadForReply } from './gmailService.js';

/**
 * Start watching Gmail for new messages (replies)
 * This should be called once per account to set up push notifications
 */
export async function watchGmail(email, topicName) {
  try {
    const account = getAccountByEmail(email);
    const gmail = getGmailClient(account.email, account.refreshToken);
    
    // Start watching for new messages
    // topicName should be: projects/YOUR_PROJECT/topics/YOUR_TOPIC
    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: topicName,
        labelIds: ['INBOX'], // Only watch inbox
      },
    });
    
    console.log(`✅ Started watching Gmail for ${email}`);
    console.log(`   History ID: ${response.data.historyId}`);
    console.log(`   Expires: ${new Date(response.data.expiration).toISOString()}`);
    
    return {
      historyId: response.data.historyId,
      expiration: response.data.expiration,
    };
  } catch (error) {
    console.error(`❌ Failed to watch Gmail for ${email}:`, error.message);
    throw error;
  }
}

/**
 * Process a Gmail push notification
 * This is called when Pub/Sub receives a notification from Gmail
 */
export async function processGmailNotification(email, historyId) {
  try {
    await connectMongo();
    
    const account = getAccountByEmail(email);
    const gmail = getGmailClient(account.email, account.refreshToken);
    
    // Get history of changes since last check
    const history = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
      historyTypes: ['messageAdded'],
    });
    
    if (!history.data.history || history.data.history.length === 0) {
      return { processed: 0 };
    }
    
    let markedAsReplied = 0;
    let cancelledFollowups = 0;
    
    // Process each history entry
    for (const entry of history.data.history) {
      if (!entry.messagesAdded || entry.messagesAdded.length === 0) {
        continue;
      }
      
      for (const messageAdded of entry.messagesAdded) {
        const messageId = messageAdded.message?.id;
        if (!messageId) continue;
        
        // Get message details
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'metadata',
          metadataHeaders: ['Thread-Id', 'In-Reply-To', 'References'],
        });
        
        const threadId = message.data.threadId;
        if (!threadId) continue;
        
        // Find campaigns with this thread ID
        const campaigns = await Campaign.find({
          threadId: threadId,
          from: email,
          replied: false,
        }).lean();
        
        if (campaigns.length === 0) {
          continue; // Not one of our campaigns
        }
        
        // Check if this is actually a reply
        for (const campaign of campaigns) {
          try {
            const hasReply = await checkThreadForReply({
              fromEmail: email,
              threadId: threadId,
              recipientEmail: campaign.to,
            });
            
            if (hasReply) {
              // Mark campaign as replied
              await Campaign.findByIdAndUpdate(campaign._id, { replied: true });
              markedAsReplied++;
              
              // Cancel pending follow-ups
              const cancelled = await Outbox.updateMany(
                {
                  type: 'followup',
                  status: { $in: ['pending', 'sending'] },
                  'campaignRef.campaignId': campaign._id,
                },
                {
                  $set: { status: 'sent' },
                  $unset: { body: '' },
                }
              );
              
              cancelledFollowups += cancelled.modifiedCount;
              
              console.log(`✅ Detected reply for ${campaign.to} - marked as replied and cancelled ${cancelled.modifiedCount} follow-ups`);
            }
          } catch (error) {
            console.error(`Error checking reply for ${campaign.to}:`, error.message);
          }
        }
      }
    }
    
    return {
      processed: history.data.history.length,
      markedAsReplied,
      cancelledFollowups,
    };
  } catch (error) {
    console.error(`Error processing Gmail notification for ${email}:`, error.message);
    throw error;
  }
}

/**
 * Alternative: Poll-based reply detection (simpler, no Pub/Sub needed)
 * Checks for replies periodically by polling Gmail threads
 */
export async function pollForReplies(email, limit = 50) {
  try {
    await connectMongo();
    
    const account = getAccountByEmail(email);
    const gmail = getGmailClient(account.email, account.refreshToken);
    
    // Get campaigns that might have replies (recently sent)
    const recentCampaigns = await Campaign.find({
      from: email,
      replied: false,
      lastSent: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      threadId: { $exists: true, $ne: null },
    })
    .limit(limit)
    .lean();
    
    let markedAsReplied = 0;
    let cancelledFollowups = 0;
    
    for (const campaign of recentCampaigns) {
      try {
        const hasReply = await checkThreadForReply({
          fromEmail: email,
          threadId: campaign.threadId,
          recipientEmail: campaign.to,
        });
        
        if (hasReply) {
          // Mark campaign as replied
          await Campaign.findByIdAndUpdate(campaign._id, { replied: true });
          markedAsReplied++;
          
          // Cancel pending follow-ups
          const cancelled = await Outbox.updateMany(
            {
              type: 'followup',
              status: { $in: ['pending', 'sending'] },
              'campaignRef.campaignId': campaign._id,
            },
            {
              $set: { status: 'sent' },
              $unset: { body: '' },
            }
          );
          
          cancelledFollowups += cancelled.modifiedCount;
          
          console.log(`✅ Detected reply for ${campaign.to} - marked as replied`);
        }
      } catch (error) {
        // Skip OAuth errors, etc.
        if (!error.message.includes('oauth2') && !error.message.includes('token')) {
          console.error(`Error checking reply for ${campaign.to}:`, error.message);
        }
      }
    }
    
    return {
      checked: recentCampaigns.length,
      markedAsReplied,
      cancelledFollowups,
    };
  } catch (error) {
    console.error(`Error polling for replies for ${email}:`, error.message);
    throw error;
  }
}

