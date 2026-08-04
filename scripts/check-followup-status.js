#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';
import { CAMPAIGN_MAX_TOUCHPOINT } from '../src/services/personalCampaignConfig.js';
import { getMaxTouchpoint } from '../src/services/followupSchedule.js';

async function main() {
  await connectMongo();

  console.log('📊 Follow-up Status Check\n');
  console.log('='.repeat(60));

  // 1. Check campaigns ready for follow-up
  console.log('\n1️⃣  Campaigns Ready for Follow-up:');
  const ready = await campaignsReadyForFollowup(false);
  console.log(`   Found ${ready.length} campaigns ready for follow-up`);
  if (ready.length > 0) {
    console.log('\n   Sample (first 5):');
    ready.slice(0, 5).forEach(c => {
      const daysSince = Math.floor((Date.now() - new Date(c.lastSent).getTime()) / (1000 * 60 * 60 * 24));
      console.log(`   - ${c.to} (TP${c.touchpoint || 1} → TP${Math.min(getMaxTouchpoint(c.campaignName), (c.touchpoint || 1) + 1)}) | ${daysSince} days since last sent`);
    });
  }

  // 2. Check follow-up emails in Outbox
  console.log('\n2️⃣  Follow-up Emails in Outbox:');
  const followupPending = await Outbox.countDocuments({ type: 'followup', status: 'pending' });
  const followupSending = await Outbox.countDocuments({ type: 'followup', status: 'sending' });
  const followupSent = await Outbox.countDocuments({ type: 'followup', status: 'sent' });
  const followupFailed = await Outbox.countDocuments({ type: 'followup', status: 'failed' });
  
  console.log(`   Pending: ${followupPending}`);
  console.log(`   Sending: ${followupSending}`);
  console.log(`   Sent: ${followupSent}`);
  console.log(`   Failed: ${followupFailed}`);

  // Show recent follow-up activity
  const recentFollowups = await Outbox.find({ type: 'followup' })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  
  if (recentFollowups.length > 0) {
    console.log('\n   Recent Follow-up Activity (last 10):');
    recentFollowups.forEach(job => {
      const created = new Date(job.createdAt).toLocaleString();
      const notBefore = new Date(job.notBefore).toLocaleString();
      const status = job.status === 'sent' ? '✅' : job.status === 'failed' ? '❌' : job.status === 'sending' ? '⏳' : '⏸️';
      console.log(`   ${status} ${job.to} | Status: ${job.status} | Created: ${created} | NotBefore: ${notBefore}`);
    });
  }

  // 3. Check campaign touchpoint progression
  console.log('\n3️⃣  Campaign Touchpoint Distribution:');
  const touchpointStats = await Campaign.aggregate([
    { $match: { replied: false } },
    { $group: { _id: '$touchpoint', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  
  touchpointStats.forEach(stat => {
    console.log(`   Touchpoint ${stat._id}: ${stat.count} campaigns`);
  });

  // 4. Check campaigns that should have advanced but haven't
  console.log('\n4️⃣  Campaigns That May Need Attention:');
  const now = Date.now();
  const stuck = await Campaign.find({ 
    replied: false, 
    touchpoint: { $lt: CAMPAIGN_MAX_TOUCHPOINT },
    lastSent: { $exists: true, $ne: null }
  }).lean();

  const stuckCampaigns = stuck.filter(c => {
    const daysSince = (now - new Date(c.lastSent).getTime()) / (1000 * 60 * 60 * 24);
    const currentTp = c.touchpoint || 1;
    
    // Check if enough time has passed for next touchpoint
    const schedule = {
      1: [3, 3],   // After TP1 → TP2 in exactly 3 days
      2: [5, 6],   // After TP2 → TP3 in 5-6 days
      3: [7, 8],   // After TP3 → TP4 in 7-8 days
      4: [10, 15], // After TP4 → TP5 in 10-15 days
    };
    
    const [minDays] = schedule[currentTp] || [999];
    return daysSince >= minDays;
  });

  console.log(`   Found ${stuckCampaigns.length} campaigns that should have advanced`);
  if (stuckCampaigns.length > 0) {
    console.log('\n   Sample (first 5):');
    stuckCampaigns.slice(0, 5).forEach(c => {
      const daysSince = Math.floor((now - new Date(c.lastSent).getTime()) / (1000 * 60 * 60 * 24));
      console.log(`   - ${c.to} | TP${c.touchpoint || 1} | ${daysSince} days since last sent`);
    });
  }

  // 5. Check for overdue emails (past notBefore date but still pending)
  console.log('\n5️⃣  Overdue Emails (Past Due Date):');
  const nowDate = new Date();
  const overdueEmails = await Outbox.find({
    status: 'pending',
    notBefore: { $lt: nowDate }
  })
    .sort({ notBefore: 1 })
    .limit(50)
    .lean();
  
  console.log(`   Found ${overdueEmails.length} overdue emails`);
  if (overdueEmails.length > 0) {
    console.log('\n   Overdue emails (first 20):');
    overdueEmails.slice(0, 20).forEach(job => {
      const overdueMinutes = Math.round((nowDate - new Date(job.notBefore).getTime()) / 60000);
      const overdueHours = Math.floor(overdueMinutes / 60);
      const overdueDays = Math.floor(overdueHours / 24);
      let overdueStr = '';
      if (overdueDays > 0) {
        overdueStr = `${overdueDays} day(s)`;
      } else if (overdueHours > 0) {
        overdueStr = `${overdueHours} hour(s)`;
      } else {
        overdueStr = `${overdueMinutes} minute(s)`;
      }
      const notBefore = new Date(job.notBefore).toLocaleString();
      console.log(`   - ${job.to} | From: ${job.from} | Type: ${job.type} | Overdue by: ${overdueStr} | Should have sent: ${notBefore}`);
    });
    if (overdueEmails.length > 20) {
      console.log(`   ... and ${overdueEmails.length - 20} more overdue emails`);
    }
    
    // Group by account
    const overdueByAccount = {};
    overdueEmails.forEach(job => {
      if (!overdueByAccount[job.from]) {
        overdueByAccount[job.from] = 0;
      }
      overdueByAccount[job.from]++;
    });
    
    console.log('\n   Overdue emails by account:');
    Object.entries(overdueByAccount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([email, count]) => {
        console.log(`     ${email}: ${count} overdue`);
      });
  } else {
    console.log('   ✅ No overdue emails found');
  }

  // 6. Check for follow-ups queued today
  console.log('\n6️⃣  Follow-ups Queued Today:');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  
  const queuedToday = await Outbox.countDocuments({
    type: 'followup',
    createdAt: { $gte: todayStart, $lte: todayEnd }
  });
  
  const sentToday = await Outbox.countDocuments({
    type: 'followup',
    status: 'sent',
    updatedAt: { $gte: todayStart, $lte: todayEnd }
  });
  
  console.log(`   Queued today: ${queuedToday}`);
  console.log(`   Sent today: ${sentToday}`);

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 To check EC2 cron job:');
  console.log('   1. SSH into your EC2 server');
  console.log('   2. Check cron logs: tail -f /var/log/cron (or check PM2 logs)');
  console.log('   3. Check if the job is running: pm2 list');
  console.log('   4. Manually run: node bin/enqueue-followups.js');
  console.log('\n✅ If you see "queued" counts increasing, follow-ups are being queued');
  console.log('✅ If you see "sent" counts increasing, follow-ups are being sent');
  console.log('⚠️  If "stuck" campaigns > 0, the cron job may not be running');

  process.exit(0);
}

main().catch((e) => { 
  console.error('❌ Error:', e);
  process.exit(1);
});

