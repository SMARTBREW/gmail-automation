import crypto from 'crypto';
import { Campaign } from '../models/Campaign.js';
import { JOB_SEARCH_CAMPAIGN } from './personalCampaignConfig.js';

export const JOB_SEARCH_RESUME_URL =
  'https://drive.google.com/file/d/1rexWHvAVwS7a_KDcWdEN2VW0S_oKwTek/view';

export function generateTrackingId() {
  return crypto.randomUUID();
}

export function getTrackingBaseUrl() {
  const base = process.env.TRACKING_BASE_URL || `http://localhost:${process.env.PORT || 5001}`;
  return base.replace(/\/$/, '');
}

export function buildResumeTrackUrl(trackingId) {
  return `${getTrackingBaseUrl()}/r/${encodeURIComponent(trackingId)}`;
}

export function injectResumeLinkIntoBody(body, trackingId) {
  const url = buildResumeTrackUrl(trackingId);
  const text = String(body || '');
  return text
    .replace(/{resumeLink}/gi, url)
    .split(JOB_SEARCH_RESUME_URL)
    .join(url);
}

export async function recordResumeClick(trackingId, meta = {}) {
  if (!trackingId) return null;

  const campaign = await Campaign.findOne({
    trackingId,
    campaignName: JOB_SEARCH_CAMPAIGN,
  });

  if (!campaign) return null;

  if (!campaign.resumeClickedAt) {
    campaign.resumeClickedAt = new Date();
    await campaign.save();
    console.log(`📄 Resume click: ${campaign.to} (${campaign.company || 'unknown company'})`);
  }

  return campaign.toObject();
}

export async function ensureTrackingIdForJob(job, campaign = null) {
  let trackingId = job.campaignRef?.trackingId || campaign?.trackingId;
  if (!trackingId) {
    trackingId = generateTrackingId();
  }
  return trackingId;
}
