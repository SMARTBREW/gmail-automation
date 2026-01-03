import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import mongoose from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import fs from 'fs';
import path from 'path';

/**
 * Export all emails from campaigns with their reply status
 * Usage: node scripts/export-email-reply-status.js [campaignName]
 * Example: node scripts/export-email-reply-status.js "we talk"
 */
async function main() {
  await connectMongo();

  // Get campaign name from command line args (optional)
  const campaignName = process.argv[2];

  console.log('📧 Exporting Email Reply Status\n');
  console.log('='.repeat(60));

  // Build query
  const query = {};
  if (campaignName) {
    query.campaignName = campaignName;
    console.log(`Filtering by campaign: "${campaignName}"\n`);
  }

  // Fetch all campaigns
  const campaigns = await Campaign.find(query)
    .sort({ lastSent: -1 })
    .lean();

  console.log(`Found ${campaigns.length} total campaigns\n`);

  if (campaigns.length === 0) {
    console.log('No campaigns found. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Deduplicate by email address (to field)
  // If same email appears multiple times, keep the MOST RECENT one (by lastSent date)
  // This ensures we use the latest campaign status, not an old one
  const emailMap = new Map();
  
  for (const campaign of campaigns) {
    const email = (campaign.to || '').toLowerCase().trim();
    if (!email) continue;
    
    if (!emailMap.has(email)) {
      emailMap.set(email, campaign);
    } else {
      // If we already have this email, prefer the MOST RECENT one (by lastSent)
      const existing = emailMap.get(email);
      const existingDate = existing.lastSent ? new Date(existing.lastSent).getTime() : 0;
      const currentDate = campaign.lastSent ? new Date(campaign.lastSent).getTime() : 0;
      
      // Keep the most recent campaign
      if (currentDate > existingDate) {
        emailMap.set(email, campaign);
      }
    }
  }
  
  const uniqueCampaigns = Array.from(emailMap.values());
  const duplicatesRemoved = campaigns.length - uniqueCampaigns.length;

  // Separate replied and unreplied campaigns
  const repliedCampaigns = uniqueCampaigns.filter(c => c.replied === true);
  const unrepliedCampaigns = uniqueCampaigns.filter(c => c.replied === false);
  const replied = repliedCampaigns.length;
  const unreplied = unrepliedCampaigns.length;

  console.log(`📊 Summary:`);
  console.log(`   ✅ Replied: ${replied} (${((replied / uniqueCampaigns.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Not Replied: ${unreplied} (${((unreplied / uniqueCampaigns.length) * 100).toFixed(1)}%)`);
  console.log(`   📧 Unique Emails: ${uniqueCampaigns.length}`);
  if (duplicatesRemoved > 0) {
    console.log(`   🗑️  Duplicates Removed: ${duplicatesRemoved}`);
  }
  console.log(`   📧 Total Campaigns Found: ${campaigns.length}\n`);

  // Show unreplied emails list
  if (unrepliedCampaigns.length > 0) {
    console.log(`❌ Emails That Did NOT Reply (${unrepliedCampaigns.length} total):\n`);
    console.log('Campaign Name | To (Email) | Recipient Name | Last Sent | Touchpoint');
    console.log('-'.repeat(90));
    
    unrepliedCampaigns.forEach(c => {
      const lastSent = c.lastSent ? new Date(c.lastSent).toLocaleDateString() : 'N/A';
      const recipientName = c.recipientName || 'N/A';
      const to = c.to || 'N/A';
      const campaignName = c.campaignName || 'N/A';
      const touchpoint = c.touchpoint || 'N/A';
      
      console.log(
        `${campaignName.padEnd(15)} | ${to.padEnd(30)} | ${recipientName.padEnd(15)} | ${lastSent.padEnd(10)} | ${touchpoint}`
      );
    });
    console.log('');
  } else {
    console.log('✅ All emails have been replied to!\n');
  }

  // Prepare CSV data - group by From email, then by reply status
  const csvRows = [];
  
  // CSV Header - Email, Name, From, Replied
  csvRows.push(['Email', 'Name', 'From', 'Replied'].join(','));

  // Group campaigns by From email
  const fromGroups = new Map();
  
  for (const campaign of uniqueCampaigns) {
    const fromEmail = (campaign.from || '').toLowerCase().trim();
    if (!fromGroups.has(fromEmail)) {
      fromGroups.set(fromEmail, []);
    }
    fromGroups.get(fromEmail).push(campaign);
  }
  
  // Sort From emails alphabetically
  const sortedFromEmails = Array.from(fromGroups.keys()).sort();
  
  // For each From email, sort by reply status (No first, then Yes)
  for (const fromEmail of sortedFromEmails) {
    const campaigns = fromGroups.get(fromEmail);
    
    // Separate by reply status
    const unreplied = campaigns.filter(c => !c.replied);
    const replied = campaigns.filter(c => c.replied);
    
    // Add unreplied first, then replied
    const sortedCampaigns = [...unreplied, ...replied];
    
    for (const campaign of sortedCampaigns) {
      const row = [
        campaign.to || '',
        campaign.recipientName || '',
        campaign.from || '',
        campaign.replied ? 'Yes' : 'No'
      ].map(field => `"${field}"`).join(','); // Wrap in quotes for CSV safety
      
      csvRows.push(row);
    }
  }

  // Write CSV file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = campaignName 
    ? `email-reply-status-${campaignName.replace(/\s+/g, '-')}-${timestamp}.csv`
    : `email-reply-status-all-${timestamp}.csv`;
  
  const filepath = path.join(process.cwd(), filename);
  fs.writeFileSync(filepath, csvRows.join('\n'), 'utf8');

  console.log(`✅ Exported to: ${filename}`);
  console.log(`   📝 CSV includes ${uniqueCampaigns.length} unique emails`);
  console.log(`   📦 Grouped by From email, then by reply status (No, then Yes)`);
  if (duplicatesRemoved > 0) {
    console.log(`   🗑️  Removed ${duplicatesRemoved} duplicate entries`);
  }
  console.log(`   📊 Columns: Email, Name, From, Replied (Yes/No)\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error exporting email reply status:', err.message || err);
  process.exit(1);
});

