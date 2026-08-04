import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { CAMPAIGN_MAX_TOUCHPOINT } from './personalCampaignConfig.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CAMPAIGNS_FILE = join(__dirname, '../../campaigns.json');
const LOCK_FILE = join(__dirname, '../../.campaigns.lock');


function ensureCampaignsFile() {
  if (!existsSync(CAMPAIGNS_FILE)) {
    writeFileSync(CAMPAIGNS_FILE, JSON.stringify({ campaigns: [] }, null, 2), 'utf8');
    console.log(' Created campaigns.json');
  }
}

export function getAllCampaigns() {
  ensureCampaignsFile();
  try {
    const data = readFileSync(CAMPAIGNS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading campaigns.json:', error);
    return { campaigns: [] };
  }
}

export function saveCampaigns(data) {
  ensureCampaignsFile();
  try {
    writeFileSync(CAMPAIGNS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving campaigns.json:', error);
    throw error;
  }
}

export function createCampaign({ from, to, subject, body, threadId, messageId }) {
  const data = getAllCampaigns();
  const campaign = {
    id: `camp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    from,
    to,
    subject,
    body,
    touchpoint: 1,
    lastSent: new Date().toISOString(),
    replied: false,
    threadId: threadId || null,
    messageId: messageId || null,
    createdAt: new Date().toISOString(),
  };
  
  data.campaigns.push(campaign);
  saveCampaigns(data);
  console.log(`Created campaign ${campaign.id} for ${to} (touchpoint 1)`);
  return campaign;
}

export function updateCampaign(campaignId, updates) {
  const data = getAllCampaigns();
  const index = data.campaigns.findIndex(c => c.id === campaignId);
  if (index === -1) {
    throw new Error(`Campaign ${campaignId} not found`);
  }
  data.campaigns[index] = { ...data.campaigns[index], ...updates };
  saveCampaigns(data);
  console.log(` Updated campaign ${campaignId}:`, Object.keys(updates).join(', '));
  return data.campaigns[index];
}

export function getCampaignsReadyForFollowup() {
  const data = getAllCampaigns();
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const twoDaysMs = 2 * oneDayMs;
  return data.campaigns.filter(campaign => {
    if (campaign.replied) return false;
    if (campaign.touchpoint >= CAMPAIGN_MAX_TOUCHPOINT) return false;
    const lastSent = new Date(campaign.lastSent);
    const daysSince = now - lastSent;
    return daysSince >= oneDayMs && daysSince <= 3 * oneDayMs;
  });
}

export function getUnrepliedCampaigns() {
  const data = getAllCampaigns();
  return data.campaigns.filter(c => !c.replied);
}


export async function acquireLock() {
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    if (!existsSync(LOCK_FILE)) {
      writeFileSync(LOCK_FILE, Date.now().toString(), 'utf8');
      return true;
    } 
    const lockTime = parseInt(readFileSync(LOCK_FILE, 'utf8'), 10);
    if (Date.now() - lockTime > 30000) {
      writeFileSync(LOCK_FILE, Date.now().toString(), 'utf8');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  return false;
}


export function releaseLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      unlinkSync(LOCK_FILE);
    } catch (e) {
    }
  }
}

