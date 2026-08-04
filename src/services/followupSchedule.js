import {
  isPersonalCampaign,
  CAMPAIGN_MAX_TOUCHPOINT,
} from './personalCampaignConfig.js';

const NGO_SCHEDULE_DAYS = {
  1: [3, 5],
  2: [5, 7],
  3: [7, 9],
  4: [10, 15],
};

const NGO_SCHEDULE_MINUTES = {
  1: [1, 2],
  2: [2, 3],
  3: [3, 4],
  4: [5, 6],
};

const PERSONAL_SCHEDULE_DAYS = {
  1: [5, 7],
  2: [5, 7],
  3: [5, 7],
  4: [5, 7],
};

const PERSONAL_SCHEDULE_MINUTES = {
  1: [1, 2],
  2: [1, 2],
  3: [1, 2],
  4: [1, 2],
};

export function getMaxTouchpoint(_campaignName) {
  return CAMPAIGN_MAX_TOUCHPOINT;
}

export function getFollowupSchedule(campaignName, testMode = false) {
  if (isPersonalCampaign(campaignName)) {
    return testMode ? PERSONAL_SCHEDULE_MINUTES : PERSONAL_SCHEDULE_DAYS;
  }
  return testMode ? NGO_SCHEDULE_MINUTES : NGO_SCHEDULE_DAYS;
}

function delayToMs(delay, testMode) {
  return testMode ? delay * 60 * 1000 : delay * 24 * 60 * 60 * 1000;
}

export function isWithinFollowupWindow(campaign, now = Date.now(), testMode = false) {
  const currentTp = campaign.touchpoint || 1;
  if (currentTp >= getMaxTouchpoint(campaign.campaignName)) return false;
  if (!campaign.lastSent) return true;

  const schedule = getFollowupSchedule(campaign.campaignName, testMode);
  const window = schedule[currentTp];
  if (!window) return false;

  const [minDelay, maxDelay] = window;
  const diff = now - new Date(campaign.lastSent).getTime();
  return diff >= delayToMs(minDelay, testMode) && diff <= delayToMs(maxDelay, testMode);
}

export function isOverdueForFollowup(campaign, now = Date.now(), testMode = false) {
  const currentTp = campaign.touchpoint || 1;
  if (currentTp >= getMaxTouchpoint(campaign.campaignName)) return false;
  if (!campaign.lastSent) return false;

  const schedule = getFollowupSchedule(campaign.campaignName, testMode);
  const window = schedule[currentTp];
  if (!window) return false;

  const [minDelay, maxDelay] = window;
  const diff = now - new Date(campaign.lastSent).getTime();
  return diff >= delayToMs(minDelay, testMode) && diff > delayToMs(maxDelay, testMode);
}
