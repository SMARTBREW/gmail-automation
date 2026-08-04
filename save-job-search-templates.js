import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
import { JOB_SEARCH_CAMPAIGN } from './src/services/personalCampaignConfig.js';

await connectMongo();

const campaignName = JOB_SEARCH_CAMPAIGN;

const RESUME_URL = 'https://drive.google.com/file/d/1rexWHvAVwS7a_KDcWdEN2VW0S_oKwTek/view';

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
<p style="${p}">I'm <strong>{senderName}</strong>. I build full-stack and AI infrastructure systems for production (React, Node, Postgres, Docker, LLM pipelines, the unglamorous stuff that actually ships).</p>
<p style="${p}"><strong>{company}</strong> is one of the teams I've had my eye on for a while. I don't know if you're the right person to ask, but you're who I found, so I'm reaching out directly.</p>
<p style="${p}"><strong>A couple of things I've shipped recently at SmartBrew:</strong></p>
<ul style="${list}">
<li style="${li}"><strong>SmartSpidy</strong>: RAG platform for document ingestion, embeddings, and AI outreach</li>
<li style="${li}"><strong>SmartRoute AI</strong>: LLM gateway with semantic caching, rate limiting, async workers, and enterprise auth</li>
</ul>
<p style="${p}">If there's an opening, someone I should talk to, or you'd be open to a quick chat, I'd really appreciate it. No pressure if it's not the right time.</p>
<p style="${p}"><a href="${RESUME_URL}" style="${link}">View my resume</a></p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  2: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">Just bumping my note from last week in case it got buried under everything else in your inbox.</p>
<p style="${p}">I'm still keen on <strong>{company}</strong>. If you have 30 seconds to point me somewhere useful (a name, a role, or even a "not hiring right now"), that would help me a lot.</p>
<p style="${p}"><strong>In case it's useful:</strong></p>
<ul style="${list}">
<li style="${li}">Production APIs, auth, caching, observability. Shipped, not prototyped.</li>
<li style="${li}">LLM infra: RAG pipelines, gateways, async workers</li>
</ul>
<p style="${sig}">Thanks,<br><strong>{senderName}</strong></p>
</div>`,

  3: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">Circling back once. I know you're busy.</p>
<p style="${p}">I'm looking for a team where I can own hard backend and AI problems in production, and <strong>{company}</strong> is still near the top of my list. If you know of anything opening up, or who I should bother instead of you, I'd be grateful.</p>
<p style="${p}">Happy to send a short write-up on my projects if that's easier than a resume.</p>
<p style="${muted}">Either way, a quick reply helps me plan. No hard feelings if it's a no.</p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  4: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">Short one. I won't take much of your time.</p>
<p style="${p}">Still interested in <strong>{company}</strong>. Open to whatever makes sense: a role, a referral, or just a name of someone I should reach out to.</p>
<p style="${p}">I work on production systems: APIs, databases, auth, caching, observability, and LLM infrastructure. I pick up context fast and ship reliably.</p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  5: `<div style="${baseStyle}">
<p style="${p}">Hi {recipientName},</p>
<p style="${p}">Last note from me. I don't want to keep pinging your inbox.</p>
<p style="${p}">I'm still interested in <strong>{company}</strong>. If there's ever a fit, an opening, or someone on the team I should talk to, I'd appreciate the nudge. If not, totally fine. Thanks for reading this far.</p>
<p style="${p}"><a href="${RESUME_URL}" style="${link}">View my resume</a></p>
<p style="${muted}">All the best.</p>
<p style="${sig}">Kind regards,<br><strong>{senderName}</strong></p>
</div>`,
};

const subjectLines = {
  1: "Probably the least spammy email you'll read today",
  2: 'In case my last note vanished into inbox hell',
  3: "Okay I'll keep this one short ({company})",
  4: 'Last few emails before I stop bothering you',
  5: 'Final note from {senderName} re: {company}',
};

await CampaignTemplate.deleteMany({ campaignName });

await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" campaign templates to database`);
console.log('   Removed em dashes from all touchpoints');
console.log('   Touchpoints: 5 (TP1 + TP5 include resume link)');

process.exit(0);
