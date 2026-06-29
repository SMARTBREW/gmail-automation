import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
import { JOB_SEARCH_CAMPAIGN } from './src/services/personalCampaignConfig.js';

await connectMongo();

const campaignName = JOB_SEARCH_CAMPAIGN;

const templates = {
  1: `<p>Dear {recipientName},</p>
<p>I hope you're doing well. My name is {senderName}, and I'm reaching out regarding opportunities on your team.</p>
<p>I've attached my resume and would welcome the chance to connect if there's a fit. I'm particularly interested in roles where I can contribute from day one and grow with the team.</p>
<p>Would you have a few minutes for a brief conversation, or could you point me to the right person on your hiring team?</p>
<p>Thank you for your time.</p>
<p>Best regards,<br>
{senderName}</p>`,

  2: `<p>Hi {recipientName},</p>
<p>I wanted to follow up on my note from last week. I understand inboxes get busy, so I thought I'd check in briefly.</p>
<p>I'm still very interested in exploring opportunities with your organization and would appreciate any guidance on next steps or the right contact for open roles.</p>
<p>Happy to share more context on my background if helpful.</p>
<p>Thanks again,<br>
{senderName}</p>`,

  3: `<p>Dear {recipientName},</p>
<p>Circling back one more time — I'm genuinely interested in contributing to your team and didn't want my earlier message to get lost.</p>
<p>If now isn't the right time, no worries at all. I'd still be grateful for a quick pointer or a "not hiring" so I know where things stand.</p>
<p>Warm regards,<br>
{senderName}</p>`,

  4: `<p>Hi {recipientName},</p>
<p>I hope this finds you well. I realise I've reached out a couple of times — thank you for bearing with me.</p>
<p>I'm still open to connecting if there's mutual interest. Even a short reply would help me plan my search accordingly.</p>
<p>Best,<br>
{senderName}</p>`,

  5: `<p>Dear {recipientName},</p>
<p>This will be my last note unless I hear back. I remain interested in your team and would welcome a conversation whenever timing works.</p>
<p>Wishing you a great week ahead.</p>
<p>Kind regards,<br>
{senderName}</p>`,
};

const subjectLines = {
  1: 'Application — {senderName}',
  2: 'Following up on my application',
  3: 'Quick follow-up',
  4: 'Still interested in connecting',
  5: 'Last note from my side',
};

await CampaignTemplate.deleteMany({ campaignName });

await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" campaign templates to database`);
console.log('   - 5 touchpoints (initial + 4 follow-ups)');
console.log('   - 5–7 day gap between touches');
console.log('   - Personal campaign: replies stop follow-ups but are not stored or counted in outreach stats');
console.log('   - Allowed senders: iamayushanand365@gmail.com, h3yayush@gmail.com');

process.exit(0);
