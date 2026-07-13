import { Campaign } from '../models/Campaign.js';
import { CampaignTemplate } from '../models/CampaignTemplate.js';
import { shouldSkipReplySave } from './replyPollConfig.js';
import { isPersonalCampaign } from './personalCampaignConfig.js';
import {
  getMaxTouchpoint,
  isWithinFollowupWindow,
} from './followupSchedule.js';

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
  company,
  trackingId,
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
    if (company && company !== existing.company) {
      updates.company = company;
    }
    if (trackingId && trackingId !== existing.trackingId) {
      updates.trackingId = trackingId;
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
    company: company || '',
    trackingId: trackingId || '',
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

  // Personal campaigns: stop follow-ups only — never store reply content or dates.
  if (isPersonalCampaign(campaign.campaignName)) {
    await Campaign.findByIdAndUpdate(campaignId, { $set: { replied: true } });
    return;
  }

  if (shouldSkipReplySave({ reply, campaignName: campaign.campaignName })) {
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
  const candidates = await Campaign.find({ replied: false, bounced: { $ne: true } }).lean();

  return candidates.filter((campaign) => isWithinFollowupWindow(campaign, now, testMode));
}

export async function advanceTouchpoint({ campaignId, newBody, newMessageId, threadId, internetMessageId }) {
  const camp = await Campaign.findById(campaignId);
  if (!camp) throw new Error('Campaign not found');
  const maxTp = getMaxTouchpoint(camp.campaignName);
  const nextTp = Math.min(maxTp, (camp.touchpoint || 1) + 1);
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
  return Campaign.find({ replied: false, bounced: { $ne: true } }).lean();
}

export async function markBounced({ campaignId, reason = '' }) {
  await Campaign.findByIdAndUpdate(campaignId, {
    $set: {
      bounced: true,
      bouncedAt: new Date(),
      bounceReason: String(reason || '').slice(0, 500),
    },
  });
}


