import { Campaign } from '../models/Campaign.js';
import { CampaignTemplate } from '../models/CampaignTemplate.js';

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
  await Campaign.findByIdAndUpdate(campaignId, { replied: true });
}

export async function campaignsReadyForFollowup(testMode = false) {
  const now = Date.now();
  // User-defined outreach cadence (delay between previous touch and next)
  // Keys are CURRENT touchpoint; values are [minDays, maxDays] to wait before sending the NEXT touchpoint
  const productionScheduleDays = {
    1: [3, 4],   // After initial (TP1) → TP2 in ~3 days
    2: [5, 6],   // TP3 ~5 days after TP2
    3: [7, 8],   // TP4 ~7 days after TP3
    4: [7, 8],   // TP5 ~7 days after TP4
    5: [10, 12], // TP6 ~10 days after TP5
    6: [10, 14], // TP7 ~10–14 days after TP6
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


