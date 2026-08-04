/**
 * Personal campaigns (e.g. job search) — isolated from NGO outreach stats and reply storage.
 */

export const JOB_SEARCH_CAMPAIGN = 'Job Search';

const PERSONAL_CAMPAIGNS = new Set([JOB_SEARCH_CAMPAIGN]);

export const PERSONAL_CAMPAIGN_ACCOUNTS = new Set([
  'iamayushanand365@gmail.com',
  'h3yayush@gmail.com',
  'ayushpy007@gmail.com',
]);

export const PERSONAL_MAX_TOUCHPOINT = 5;
export const NGO_MAX_TOUCHPOINT = 5;
export const CAMPAIGN_MAX_TOUCHPOINT = 5;

export function isPersonalCampaign(campaignName) {
  return PERSONAL_CAMPAIGNS.has(campaignName);
}

export function assertPersonalCampaignAccount(campaignName, fromEmail) {
  if (!isPersonalCampaign(campaignName)) return;
  if (!PERSONAL_CAMPAIGN_ACCOUNTS.has(fromEmail)) {
    throw new Error(
      `Campaign "${campaignName}" may only be sent from: ${[...PERSONAL_CAMPAIGN_ACCOUNTS].join(', ')}`,
    );
  }
}

/** Mongo filter to exclude personal campaigns from outreach reply reports. */
export function outreachCampaignFilter() {
  return { campaignName: { $nin: [...PERSONAL_CAMPAIGNS] } };
}
