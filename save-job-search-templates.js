import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
import { JOB_SEARCH_CAMPAIGN } from './src/services/personalCampaignConfig.js';

await connectMongo();

const campaignName = JOB_SEARCH_CAMPAIGN;

// Plain Drive link (tracking may rewrite at send time if enabled)
const RESUME_URL = 'https://drive.google.com/file/d/1rexWHvAVwS7a_KDcWdEN2VW0S_oKwTek/view';

// Keep HTML minimal — heavy styling, bold stacks, and bullet lists look like bulk mail
const templates = {
  1: `<p>Hi {recipientName},</p>
<p>Hope you're doing well. My name is {senderName}. I build backend and full-stack systems (Node.js, React, PostgreSQL, Redis, Docker), and I've been working on AI infrastructure at SmartBrew, including a RAG product and an LLM gateway used in production.</p>
<p>I wanted to ask if {company} is hiring for engineering roles, or if you could point me to the right person on the team. No worries if timing isn't right.</p>
<p>Resume: <a href="${RESUME_URL}">${RESUME_URL}</a></p>
<p>Thanks for your time,<br>
{senderName}</p>`,

  2: `<p>Hi {recipientName},</p>
<p>Just following up on my earlier note about engineering roles at {company}.</p>
<p>If nothing is open right now, even a short "not hiring" or a pointer to the right contact would help. Happy to share more about my background if useful.</p>
<p>Thanks,<br>
{senderName}</p>`,

  3: `<p>Hi {recipientName},</p>
<p>Checking in once more in case my earlier emails got buried.</p>
<p>I'm still interested in {company}. If you know who owns hiring for engineering, I'd appreciate an intro. If now isn't a good time, no problem at all.</p>
<p>Best,<br>
{senderName}</p>`,

  4: `<p>Hi {recipientName},</p>
<p>I'll keep this short. Still open to connecting about engineering roles at {company}, or being pointed to the right person.</p>
<p>Thanks either way,<br>
{senderName}</p>`,

  5: `<p>Hi {recipientName},</p>
<p>Last note from my side. If anything opens up on the engineering team at {company}, I'd still love an intro. Otherwise, thanks for your time and wishing you a good week.</p>
<p>Resume: <a href="${RESUME_URL}">${RESUME_URL}</a></p>
<p>Best,<br>
{senderName}</p>`,
};

// Subjects: avoid pipes, "Quick intro", and salesy phrases that trigger spam filters
const subjectLines = {
  1: 'Question about engineering roles at {company}',
  2: 'Following up on my note',
  3: 'Quick question for you',
  4: 'Checking in',
  5: 'Closing the loop',
};

await CampaignTemplate.deleteMany({ campaignName });

await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" campaign templates to database`);
console.log('   - Subjects rewritten (less spam-like)');
console.log('   - Body simplified (minimal HTML, shorter copy)');
console.log('   - Placeholders: {recipientName}, {senderName}, {company}');
console.log('   - Resume: Google Drive link');

process.exit(0);
