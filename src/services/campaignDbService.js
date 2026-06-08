import { Campaign } from '../models/Campaign.js';
import { CampaignTemplate } from '../models/CampaignTemplate.js';
import { shouldSkipReplySave } from './replyPollConfig.js';

export async function getTemplateForCampaign(campaignName) {
  const tpl = await CampaignTemplate.findOne({ campaignName }).lean();
  if (!tpl) throw new Error(`Campaign template not found: ${campaignName}`);
  return tpl;
}

export async function createCampaignRecord({
  campaignName,
  to,
  from,
  displayName,
  subject,
  recipientName,
  threadId,
  messageId,
  internetMessageId,
}) {
  // Check if a campaign already exists for this recipient+from+campaignName combination
  // This prevents duplicate campaigns when load-initial-batch.js is run multiple times
  const existing = await Campaign.findOne({
    to,
    from,
    campaignName,
  }).lean();

  if (existing) {
    // Campaign already exists - return it instead of creating a duplicate
    // Only update fields that might have changed (threadId, messageIds, etc.)
    const updates = {};
    if (threadId && threadId !== existing.threadId) {
      updates.threadId = threadId;
    }
    if (messageId && !existing.messageIds?.includes(messageId)) {
      updates.messageIds = [...(existing.messageIds || []), messageId];
    }
    if (internetMessageId && !existing.allInternetMessageIds?.includes(internetMessageId)) {
      updates.allInternetMessageIds = [...(existing.allInternetMessageIds || []), internetMessageId];
    }
    if (internetMessageId && internetMessageId !== existing.internetMessageId) {
      updates.internetMessageId = internetMessageId;
    }
    if (recipientName && recipientName !== existing.recipientName) {
      updates.recipientName = recipientName;
    }

    if (Object.keys(updates).length > 0) {
      const updated = await Campaign.findByIdAndUpdate(
        existing._id,
        { $set: updates },
        { new: true }
      ).lean();
      return updated;
    }

    return existing;
  }

  // No existing campaign - create a new one
  // Always save recipientName (even if empty) to ensure it's available for follow-ups
  // Empty string is better than null/undefined for template replacement
  const doc = await Campaign.create({
    campaignName,
    to,
    from,
    displayName,
    subject,
    recipientName: recipientName || '', // Ensure it's always a string
    touchpoint: 1,
    lastSent: new Date(),
    replied: false,
    threadId,
    messageIds: messageId ? [messageId] : [],
    internetMessageId,
    allInternetMessageIds: internetMessageId ? [internetMessageId] : [],
  });
  return doc.toObject();
}

export async function markReplied({ campaignId }) {
  await Campaign.findByIdAndUpdate(campaignId, { replied: true, repliedAt: new Date() });
}

export async function markRepliedWithDetails({ campaignId, reply }) {
  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) return;

  if (shouldSkipReplySave({ reply })) {
    console.warn(
      `Skipping non-outreach reply save for campaign ${campaignId} (${campaign.to}): ${reply?.subject || '(no subject)'}`,
    );
    return;
  }

  const gmailMessageId = reply?.gmailMessageId || '';
  if (gmailMessageId) {
    const alreadyOn = await Campaign.findOne({
      from: campaign.from,
      replyMessageId: gmailMessageId,
      _id: { $ne: campaignId },
    })
      .select('to')
      .lean();
    if (alreadyOn) {
      console.warn(
        `Skipping duplicate reply save: Gmail message ${gmailMessageId} already stored on ${alreadyOn.to} (not ${campaign.to})`,
      );
      return;
    }
  }

  const update = {
    replied: true,
    repliedAt: reply?.date || new Date(),
  };

  if (reply) {
    update.replyFrom = reply.fromHeader || reply.fromEmail || '';
    update.replyEmail = reply.fromEmail || '';
    update.replySubject = reply.subject || '';
    update.replySnippet = reply.snippet || '';
    update.replyBody = reply.body || '';
    update.replyMessageId = gmailMessageId;
  }

  await Campaign.findByIdAndUpdate(campaignId, { $set: update });
}

export async function campaignsReadyForFollowup(testMode = false) {
  const now = Date.now();
  // User-defined outreach cadence (delay between previous touch and next)
  // Keys are CURRENT touchpoint; values are [minDays, maxDays] to wait before sending the NEXT touchpoint
  // Extended windows (2+ days) ensure campaigns that can't send due to daily limits remain eligible
  // Only campaigns within the window (minDays to maxDays) are considered ready
  const productionScheduleDays = {
    1: [3, 5],   // After initial (TP1) → TP2 between 3-5 days later (2-day window)
    2: [5, 7],   // TP2 → TP3 between 5-7 days later (2-day window)
    3: [7, 9],   // TP3 → TP4 between 7-9 days later (2-day window)
    4: [7, 9],   // TP4 → TP5 between 7-9 days later (2-day window)
    5: [10, 13], // TP5 → TP6 between 10-13 days later (3-day window)
    6: [10, 15], // TP6 → TP7 between 10-15 days later (5-day window)
  };
  // Test mode uses minutes with the same shape, for fast QA
  const testScheduleMinutes = {
    1: [1, 2],
    2: [2, 3],
    3: [3, 4],
    4: [3, 4],
    5: [4, 5],
    6: [5, 6],
  };

  const candidates = await Campaign.find({ replied: false, touchpoint: { $lt: 7 } }).lean();

  return candidates.filter(campaign => {
    if (!campaign.lastSent) return true;
    const currentTp = campaign.touchpoint || 1;
    const schedule = testMode ? testScheduleMinutes : productionScheduleDays;
    const window = schedule[currentTp];
    if (!window) return false; // no next touchpoint window

    const [minDelay, maxDelay] = window;
    const minMs = testMode ? minDelay * 60 * 1000 : minDelay * 24 * 60 * 60 * 1000;
    const maxMs = testMode ? maxDelay * 60 * 1000 : maxDelay * 24 * 60 * 60 * 1000;

    const diff = now - new Date(campaign.lastSent).getTime();
    // Strict window check: only consider campaigns within the proper window (minDays to maxDays)
    // Overdue campaigns (older than maxDays) will NOT be queued
    return diff >= minMs && diff <= maxMs;
  });
}

export async function advanceTouchpoint({ campaignId, newBody, newMessageId, threadId, internetMessageId }) {
  const camp = await Campaign.findById(campaignId);
  if (!camp) throw new Error('Campaign not found');
  const nextTp = Math.min(7, (camp.touchpoint || 1) + 1);
  // Don't store HTML bodies to save database space - they're not needed after sending
  camp.touchpoint = nextTp;
  camp.lastSent = new Date();
  if (newMessageId) camp.messageIds = [...(camp.messageIds || []), newMessageId];
  if (threadId) camp.threadId = threadId;
  if (internetMessageId) {
    camp.allInternetMessageIds = [...(camp.allInternetMessageIds || []), internetMessageId];
  }
  await camp.save();
  return camp.toObject();
}

export async function getUnrepliedCampaigns() {
  return Campaign.find({ replied: false }).lean();
}


