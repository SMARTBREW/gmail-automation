import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import mongoose from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

/**
 * Verify reply status in database for emails
 * Usage: node scripts/verify-reply-status.js <email>
 * Or: node scripts/verify-reply-status.js (checks all campaigns marked as replied)
 */
async function main() {
  await connectMongo();

  const emailToCheck = process.argv[2];

  if (emailToCheck) {
    // Check specific email
    console.log(`🔍 Checking reply status for: ${emailToCheck}\n`);
    
    const campaigns = await Campaign.find({
      to: { $regex: emailToCheck.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    }).sort({ lastSent: -1 }).lean();

    if (campaigns.length === 0) {
      console.log(`❌ No campaigns found for ${emailToCheck}`);
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`Found ${campaigns.length} campaign(s) for this email:\n`);
    
    campaigns.forEach((c, i) => {
      console.log(`${i + 1}. Campaign:`);
      console.log(`   Email: ${c.to}`);
      console.log(`   From: ${c.from}`);
      console.log(`   Replied (DB): ${c.replied ? '✅ Yes' : '❌ No'}`);
      console.log(`   Campaign Name: ${c.campaignName || 'N/A'}`);
      console.log(`   Touchpoint: ${c.touchpoint || 'N/A'}`);
      console.log(`   Last Sent: ${c.lastSent ? new Date(c.lastSent).toISOString() : 'N/A'}`);
      console.log(`   Thread ID: ${c.threadId || 'N/A'}`);
      console.log('');
    });

    // Check if there are conflicting statuses
    const repliedCount = campaigns.filter(c => c.replied).length;
    const unrepliedCount = campaigns.filter(c => !c.replied).length;
    
    if (repliedCount > 0 && unrepliedCount > 0) {
      console.log(`⚠️  WARNING: This email has conflicting statuses!`);
      console.log(`   ${repliedCount} campaign(s) marked as replied`);
      console.log(`   ${unrepliedCount} campaign(s) marked as NOT replied`);
    }
    
  } else {
    // Check all campaigns marked as replied to find potential issues
    console.log('🔍 Checking all campaigns marked as replied for potential issues...\n');
    
    const repliedCampaigns = await Campaign.find({ replied: true })
      .sort({ lastSent: -1 })
      .lean();

    console.log(`Found ${repliedCampaigns.length} campaigns marked as replied\n`);

    // Group by email to find duplicates
    const emailMap = new Map();
    
    for (const campaign of repliedCampaigns) {
      const email = (campaign.to || '').toLowerCase().trim();
      if (!email) continue;
      
      if (!emailMap.has(email)) {
        emailMap.set(email, []);
      }
      emailMap.get(email).push(campaign);
    }

    // Find emails with multiple campaigns (potential duplicates)
    const duplicates = [];
    const singleEntries = [];
    
    for (const [email, campaigns] of emailMap.entries()) {
      if (campaigns.length > 1) {
        duplicates.push({ email, campaigns });
      } else {
        singleEntries.push({ email, campaign: campaigns[0] });
      }
    }

    console.log(`📊 Analysis:`);
    console.log(`   Emails with single campaign: ${singleEntries.length}`);
    console.log(`   Emails with multiple campaigns: ${duplicates.length}\n`);

    // Check for emails that also have unreplied campaigns
    console.log('🔍 Checking for emails that have BOTH replied and unreplied campaigns...\n');
    
    let issuesFound = 0;
    const issueEmails = [];

    for (const [email, repliedCamps] of emailMap.entries()) {
      // Check if this email also has unreplied campaigns
      const unrepliedCamps = await Campaign.find({
        to: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        replied: false
      }).lean();

      if (unrepliedCamps.length > 0) {
        issuesFound++;
        issueEmails.push({
          email,
          repliedCount: repliedCamps.length,
          unrepliedCount: unrepliedCamps.length,
          repliedCampaigns: repliedCamps,
          unrepliedCampaigns: unrepliedCamps
        });
      }
    }

    if (issuesFound > 0) {
      console.log(`⚠️  Found ${issuesFound} email(s) with conflicting reply statuses:\n`);
      
      issueEmails.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.email}`);
        console.log(`   ✅ Marked as replied: ${issue.repliedCount} campaign(s)`);
        console.log(`   ❌ Marked as NOT replied: ${issue.unrepliedCount} campaign(s)`);
        console.log(`   Latest replied campaign: ${issue.repliedCampaigns[0].campaignName || 'N/A'} (Last sent: ${issue.repliedCampaigns[0].lastSent ? new Date(issue.repliedCampaigns[0].lastSent).toISOString() : 'N/A'})`);
        console.log(`   Latest unreplied campaign: ${issue.unrepliedCampaigns[0].campaignName || 'N/A'} (Last sent: ${issue.unrepliedCampaigns[0].lastSent ? new Date(issue.unrepliedCampaigns[0].lastSent).toISOString() : 'N/A'})`);
        console.log('');
      });
    } else {
      console.log('✅ No conflicting statuses found!');
    }

    // Check specific example
    console.log('\n🔍 Checking example: natasha@selfcareindia.com\n');
    const natashaCampaigns = await Campaign.find({
      to: { $regex: 'natasha@selfcareindia.com', $options: 'i' }
    }).sort({ lastSent: -1 }).lean();

    if (natashaCampaigns.length > 0) {
      natashaCampaigns.forEach((c, i) => {
        console.log(`${i + 1}. Replied: ${c.replied ? '✅ Yes' : '❌ No'} | Campaign: ${c.campaignName || 'N/A'} | Last Sent: ${c.lastSent ? new Date(c.lastSent).toISOString() : 'N/A'}`);
      });
    } else {
      console.log('No campaigns found for natasha@selfcareindia.com');
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});

