import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
import { JOB_SEARCH_CAMPAIGN } from './src/services/personalCampaignConfig.js';

await connectMongo();

const campaignName = JOB_SEARCH_CAMPAIGN;

const baseStyle = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #202124; max-width: 620px;`;

const p = 'margin: 0 0 14px 0;';
const sig = 'margin: 20px 0 0 0; color: #202124;';
const link = 'color: #1a73e8; text-decoration: none; font-weight: 500;';
const muted = 'margin: 0 0 14px 0; color: #5f6368; font-size: 14px;';
const list = 'margin: 0 0 14px 0; padding-left: 20px;';
const li = 'margin-bottom: 8px;';

const templates = {
  1: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">I'm <strong>{senderName}</strong>, a Full Stack and AI Infrastructure Engineer. I'm exploring opportunities at <strong>{company}</strong> and thought you might be the right person to connect with.</p>
<p style="${p}">I focus on production-grade systems, not demos. My stack includes React, Next.js, Node.js, PostgreSQL, Redis, Docker, and modern LLM architectures.</p>
<p style="${p}"><strong>Recent work at SmartBrew:</strong></p>
<ul style="${list}">
<li style="${li}"><strong>SmartSpidy</strong>: RAG platform for document ingestion, embeddings, and AI outreach</li>
<li style="${li}"><strong>SmartRoute AI</strong>: LLM gateway with semantic caching, rate limiting, async workers, and enterprise auth</li>
</ul>
<p style="${p}">I'm not assuming there is an open role right now. If <strong>{company}</strong> is hiring, or if you can point me to someone on the engineering team, I'd really appreciate a referral or a quick intro.</p>
<p style="${p}"><a href="{resumeLink}" style="${link}">View my resume</a></p>
<p style="${p}">Happy to share more on my work or jump on a brief call if helpful.</p>
<p style="${sig}">Best regards,<br><strong>{senderName}</strong></p>
</div>`,

  2: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">Just following up on my note from last week.</p>
<p style="${p}">I'm exploring backend, full-stack, and AI infrastructure roles, and <strong>{company}</strong> is high on my list. No pressure if nothing is open right now. Even a pointer to the right hiring contact, or a quick "not hiring," would help a lot.</p>
<p style="${p}"><strong>Quick background:</strong></p>
<ul style="${list}">
<li style="${li}"><strong>SmartSpidy</strong>: RAG and outreach automation</li>
<li style="${li}"><strong>SmartRoute AI</strong>: production LLM gateway, end to end from architecture to deployment</li>
</ul>
<p style="${p}">Thanks for considering it.</p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  3: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">Circling back once more.</p>
<p style="${p}">I'm looking for a team where I can own hard backend and AI infrastructure problems in production. If <strong>{company}</strong> has, or might soon have, openings in engineering, I'd be grateful for a referral or an intro to the right person.</p>
<p style="${muted}">If the timing is not right, totally fine. A quick note either way helps me plan my search.</p>
<p style="${sig}">Best regards,<br><strong>{senderName}</strong></p>
</div>`,

  4: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">I know inboxes get busy, so I'll keep this short.</p>
<p style="${p}">I'm still very interested in <strong>{company}</strong> and would welcome any chance to connect, whether that is an open role, a future opening, or a pointer to the right contact on your team.</p>
<p style="${p}">My strength is production systems: APIs, databases, auth, caching, observability, and LLM infrastructure. Happy to send a one-pager on my projects if useful.</p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  5: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">This will be my last message unless I hear back.</p>
<p style="${p}">I remain interested in <strong>{company}</strong> and would still appreciate a referral or intro if anything opens up on the engineering side. If it is not a fit or not the right time, no worries at all. Thank you for your time.</p>
<p style="${p}"><a href="{resumeLink}" style="${link}">View my resume</a></p>
<p style="${muted}">Wishing you a great week ahead.</p>
<p style="${sig}">Kind regards,<br><strong>{senderName}</strong></p>
</div>`,
};

const subjectLines = {
  1: 'Quick intro from {senderName} | Full Stack and AI Infrastructure',
  2: 'Re: Quick intro from {senderName}',
  3: 'Any openings or referrals at {company}?',
  4: 'Still interested in connecting at {company}',
  5: 'Last note from {senderName}',
};

await CampaignTemplate.deleteMany({ campaignName });

await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" campaign templates to database`);
console.log('   - 5 touchpoints (cold outreach + 4 follow-ups)');
console.log('   - 5-7 day gap between touches');
console.log('   - Placeholders: {recipientName}, {senderName}, {company}, {resumeLink}');
console.log('   - Personal campaign: replies stop follow-ups but are not stored or counted in outreach stats');
console.log('   - Allowed senders: iamayushanand365@gmail.com, h3yayush@gmail.com');

process.exit(0);
