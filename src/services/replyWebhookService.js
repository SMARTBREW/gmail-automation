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
import { getReplyPollConfig, gmailAfterDate } from './replyPollConfig.js';

async function cancelPendingFollowups(campaignId) {
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

function buildPollEligibilityQuery(now) {
  const { pollDays, staleCheckDays } = getReplyPollConfig();
  const pollDaysAgo = new Date(now.getTime() - pollDays * 24 * 60 * 60 * 1000);
  const staleCheckCutoff = new Date(now.getTime() - staleCheckDays * 24 * 60 * 60 * 1000);

  return {
    $or: [
      { lastSent: { $gte: pollDaysAgo } },
      {
        lastSent: { $exists: true, $ne: null },
        $or: [
          { lastReplyCheck: { $exists: false } },
          { lastReplyCheck: null },
          { lastReplyCheck: { $lt: staleCheckCutoff } },
        ],
      },
    ],
  };
}

function buildNeedsCheckQuery(now) {
  const { minHoursBetweenChecks } = getReplyPollConfig();
  const checkCutoff = new Date(now.getTime() - minHoursBetweenChecks * 60 * 60 * 1000);

  return {
    $or: [
      { lastReplyCheck: { $exists: false } },
      { lastReplyCheck: null },
      { lastReplyCheck: { $lt: checkCutoff } },
    ],
  };
}

/**
 * Rotate queue: pending follow-ups, then stalest checks, then newest sends.
 */
async function selectCampaignsForPoll(email, limit, now) {
  const eligibility = buildPollEligibilityQuery(now);
  const needsCheck = buildNeedsCheckQuery(now);

  const baseQuery = {
    from: email,
    replied: false,
    threadId: { $exists: true, $ne: null },
    $and: [needsCheck, eligibility],
  };

  const pendingFollowups = await Outbox.find({
    type: 'followup',
    status: { $in: ['pending', 'sending'] },
    from: email,
  })
    .select('campaignRef.campaignId')
    .lean();

  const priorityCampaignIds = pendingFollowups
    .map((f) => f.campaignRef?.campaignId)
    .filter(Boolean);

  const selected = [];
  const seen = new Set();

  const addCampaigns = (list) => {
    for (const c of list) {
      const id = String(c._id);
      if (seen.has(id) || selected.length >= limit) continue;
      seen.add(id);
      selected.push(c);
    }
  };

  if (priorityCampaignIds.length > 0) {
    const priority = await Campaign.find({
      ...baseQuery,
      _id: { $in: priorityCampaignIds },
    }).lean();
    addCampaigns(priority);
  }

  const remainingAfterPriority = limit - selected.length;
  const staleSlot = Math.floor(remainingAfterPriority / 2);
  const recentSlot = remainingAfterPriority - staleSlot;

  if (staleSlot > 0) {
    const excludeIds = [...seen];
    const stalest = await Campaign.find({
      ...baseQuery,
      ...(excludeIds.length > 0 ? { _id: { $nin: excludeIds } } : {}),
    })
      .sort({ lastReplyCheck: 1, lastSent: -1 })
      .limit(staleSlot)
      .lean();
    addCampaigns(stalest);
  }

  if (recentSlot > 0) {
    const excludeIds = [...seen];
    const recent = await Campaign.find({
      ...baseQuery,
      ...(excludeIds.length > 0 ? { _id: { $nin: excludeIds } } : {}),
    })
      .sort({ lastSent: -1 })
      .limit(recentSlot)
      .lean();
    addCampaigns(recent);
  }

  return selected;
}

async function listRecentInboxThreadIds(email, inboxScanDays) {
  const account = getAccountByEmail(email);
  const gmail = getGmailClient(account.email, account.refreshToken);
  const q = `in:inbox after:${gmailAfterDate(inboxScanDays)} -from:${email}`;
  const threadIds = new Set();
  let pageToken;

  do {
    const response = await gmail.users.threads.list({
      userId: 'me',
      q,
      maxResults: 100,
      pageToken,
    });
    for (const thread of response.data.threads || []) {
      if (thread.id) threadIds.add(thread.id);
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return threadIds;
}

async function tryMarkCampaignReply(campaign, email) {
  const hasReply = await checkThreadForReply({
    fromEmail: email,
    threadId: campaign.threadId,
    recipientEmail: campaign.to,
    outboundSubject: campaign.subject || null,
    internetMessageId: campaign.internetMessageId || null,
    allInternetMessageIds: campaign.allInternetMessageIds || null,
    lastSent: campaign.lastSent || null,
  });

  if (!hasReply) return { marked: false, cancelledFollowups: 0 };

  const reply = await getLatestHumanReply({
    fromEmail: email,
    threadId: campaign.threadId,
    recipientEmail: campaign.to,
    outboundSubject: campaign.subject || null,
    internetMessageId: campaign.internetMessageId || null,
    allInternetMessageIds: campaign.allInternetMessageIds || null,
    lastSent: campaign.lastSent || null,
  });

  if (!reply) return { marked: false, cancelledFollowups: 0 };

  await markRepliedWithDetails({ campaignId: campaign._id, reply });
  const cancelled = await cancelPendingFollowups(campaign._id);

  return { marked: true, cancelledFollowups: cancelled.modifiedCount };
}

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
              outboundSubject: campaign.subject || null,
              internetMessageId: campaign.internetMessageId || null,
              allInternetMessageIds: campaign.allInternetMessageIds || null,
              lastSent: campaign.lastSent || null,
            });
            
            if (hasReply) {
              const reply = await getLatestHumanReply({
                fromEmail: email,
                threadId,
                recipientEmail: campaign.to,
                outboundSubject: campaign.subject || null,
                internetMessageId: campaign.internetMessageId || null,
                allInternetMessageIds: campaign.allInternetMessageIds || null,
                lastSent: campaign.lastSent || null,
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
 * Inbox-first pass: scan recent inbox threads and match unreplied campaigns by threadId.
 * Catches replies that the rotated campaign queue never reaches.
 */
export async function pollInboxForReplies(email) {
  await connectMongo();
  getAccountByEmail(email);

  const { inboxScanDays } = getReplyPollConfig();
  const threadIds = await listRecentInboxThreadIds(email, inboxScanDays);

  let markedAsReplied = 0;
  let cancelledFollowups = 0;
  let threadsScanned = threadIds.size;

  for (const threadId of threadIds) {
    const campaigns = await Campaign.find({
      from: email,
      threadId,
      replied: false,
    }).lean();

    for (const campaign of campaigns) {
      try {
        const result = await tryMarkCampaignReply(campaign, email);
        if (result.marked) {
          markedAsReplied++;
          cancelledFollowups += result.cancelledFollowups;
          await Campaign.findByIdAndUpdate(campaign._id, { $set: { lastReplyCheck: new Date() } });
          console.log(`✅ [inbox] Reply for ${campaign.to}`);
        }
      } catch (error) {
        if (!error.message.includes('oauth2') && !error.message.includes('token')) {
          console.error(`Error [inbox] ${campaign.to}:`, error.message);
        }
      }
    }
  }

  return { threadsScanned, markedAsReplied, cancelledFollowups };
}

/**
 * Campaign-queue pass: rotated selection (follow-ups, stale checks, recent sends).
 */
export async function pollCampaignQueueForReplies(email, limit) {
  await connectMongo();
  getAccountByEmail(email);

  const pollLimit = limit ?? getReplyPollConfig().limit;
  const now = new Date();
  const campaignsToCheck = await selectCampaignsForPoll(email, pollLimit, now);

  let markedAsReplied = 0;
  let cancelledFollowups = 0;

  for (const campaign of campaignsToCheck) {
    try {
      await Campaign.findByIdAndUpdate(campaign._id, { $set: { lastReplyCheck: now } });

      const result = await tryMarkCampaignReply(campaign, email);
      if (result.marked) {
        markedAsReplied++;
        cancelledFollowups += result.cancelledFollowups;
        console.log(`✅ [queue] Reply for ${campaign.to}`);
      }
    } catch (error) {
      if (!error.message.includes('oauth2') && !error.message.includes('token')) {
        console.error(`Error [queue] ${campaign.to}:`, error.message);
      }
      await Campaign.findByIdAndUpdate(campaign._id, { $unset: { lastReplyCheck: '' } });
    }
  }

  return {
    checked: campaignsToCheck.length,
    markedAsReplied,
    cancelledFollowups,
  };
}

/**
 * Full poll: inbox-first, then rotated campaign queue.
 */
export async function pollForReplies(email, limit) {
  try {
    const inbox = await pollInboxForReplies(email);
    const queue = await pollCampaignQueueForReplies(email, limit);

    return {
      inboxThreadsScanned: inbox.threadsScanned,
      checked: queue.checked,
      markedAsReplied: inbox.markedAsReplied + queue.markedAsReplied,
      cancelledFollowups: inbox.cancelledFollowups + queue.cancelledFollowups,
      inboxMarked: inbox.markedAsReplied,
      queueMarked: queue.markedAsReplied,
    };
  } catch (error) {
    console.error(`Error polling for replies for ${email}:`, error.message);
    throw error;
  }
}

