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
import { checkThreadForReply, getLatestHumanReply } from './gmailService.js';
import { markRepliedWithDetails } from './campaignDbService.js';

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
              const reply = await getLatestHumanReply({
                fromEmail: email,
                threadId,
              });

              // Mark campaign as replied and save reply details
              await markRepliedWithDetails({ campaignId: campaign._id, reply });
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
export async function pollForReplies(email, limit = 200) {
  try {
    await connectMongo();
    
    const account = getAccountByEmail(email);
    const gmail = getGmailClient(account.email, account.refreshToken);
    
    const now = new Date();
    // Only check campaigns that:
    // 1. Were sent in the last 30 days (extended window to catch older replies)
    // 2. Haven't been checked in the last 6 hours (avoid redundant checks)
    // 3. Have a threadId (required for checking)
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // PRIORITY: First check campaigns that have pending follow-ups (these are most critical)
    const { Outbox } = await import('../models/Outbox.js');
    const pendingFollowups = await Outbox.find({
      type: 'followup',
      status: { $in: ['pending', 'sending'] },
      from: email
    }).select('campaignRef.campaignId').lean();
    
    const priorityCampaignIds = pendingFollowups
      .map(f => f.campaignRef?.campaignId)
      .filter(Boolean);
    
    // Base query for campaigns that need checking
    const baseQuery = {
      from: email,
      replied: false,
      lastSent: { $gte: thirtyDaysAgo }, // Extended to 30 days
      threadId: { $exists: true, $ne: null },
      $or: [
        { lastReplyCheck: { $exists: false } }, // Never checked
        { lastReplyCheck: null }, // Never checked
        { lastReplyCheck: { $lt: sixHoursAgo } }, // Checked more than 6 hours ago
      ],
    };
    
    // Get priority campaigns first (those with pending follow-ups)
    let campaignsToCheck = [];
    if (priorityCampaignIds.length > 0) {
      const priorityCampaigns = await Campaign.find({
        ...baseQuery,
        _id: { $in: priorityCampaignIds }
      })
      .sort({ lastSent: -1 })
      .limit(limit)
      .lean();
      campaignsToCheck = priorityCampaigns;
    }
    
    // If we haven't reached the limit, get other campaigns
    if (campaignsToCheck.length < limit) {
      const remainingLimit = limit - campaignsToCheck.length;
      const existingIds = campaignsToCheck.map(c => c._id);
      const otherCampaigns = await Campaign.find({
        ...baseQuery,
        ...(existingIds.length > 0 ? { _id: { $nin: existingIds } } : {})
      })
      .sort({ lastSent: -1 })
      .limit(remainingLimit)
      .lean();
      campaignsToCheck = [...campaignsToCheck, ...otherCampaigns];
    }
    
    let markedAsReplied = 0;
    let cancelledFollowups = 0;
    
    for (const campaign of campaignsToCheck) {
      try {
        // Update lastReplyCheck immediately to avoid duplicate checks if script runs in parallel
        await Campaign.findByIdAndUpdate(
          campaign._id,
          { $set: { lastReplyCheck: now } }
        );
        
        const hasReply = await checkThreadForReply({
          fromEmail: email,
          threadId: campaign.threadId,
          recipientEmail: campaign.to,
        });
        
        if (hasReply) {
          const reply = await getLatestHumanReply({
            fromEmail: email,
            threadId: campaign.threadId,
          });

          // Mark campaign as replied and save reply details
          await markRepliedWithDetails({ campaignId: campaign._id, reply });
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
        // Reset lastReplyCheck on error so it can be retried
        await Campaign.findByIdAndUpdate(
          campaign._id,
          { $unset: { lastReplyCheck: '' } }
        );
      }
    }
    
    return {
      checked: campaignsToCheck.length,
      markedAsReplied,
      cancelledFollowups,
    };
  } catch (error) {
    console.error(`Error polling for replies for ${email}:`, error.message);
    throw error;
  }
}

