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
<p style="${p}">{greeting}</p>
<p style="${p}">I'm <strong>{senderName}</strong>, a software engineer focused on backend systems and AI infrastructure in production (Node, Postgres, Docker, LLM pipelines, and the reliability work that keeps them running).</p>
<p style="${p}">{openingLine}</p>
<p style="${p}"><strong>Recent work at SmartBrew:</strong></p>
<ul style="${list}">
<li style="${li}"><strong>SmartSpidy</strong> — document ingestion, embeddings, and AI-assisted outreach at scale</li>
<li style="${li}"><strong>SmartRoute AI</strong> — LLM gateway with semantic caching, rate limiting, async workers, and auth</li>
</ul>
<p style="${p}">If there's a relevant opening, someone I should speak with, or you'd be open to a brief conversation, I'd really appreciate it.</p>
<p style="${p}"><a href="${RESUME_URL}" style="${link}">View my resume</a></p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  2: `<div style="${baseStyle}">
<p style="${p}">{greeting}</p>
<p style="${p}">{followUpIntro}</p>
<p style="${p}">{followUpAsk}</p>
<p style="${p}"><strong>Quick background:</strong></p>
<ul style="${list}">
<li style="${li}">Production APIs, auth, caching, observability — shipped, not slideware</li>
<li style="${li}">LLM infra: RAG pipelines, gateways, async workers</li>
<li style="${li}">Comfortable owning features end-to-end and picking up context quickly</li>
</ul>
<p style="${sig}">Thanks,<br><strong>{senderName}</strong></p>
</div>`,

  3: `<div style="${baseStyle}">
<p style="${p}">{greeting}</p>
<p style="${p}">Circling back once — I know inboxes get busy.</p>
<p style="${p}">{circleBackAsk}</p>
<p style="${p}">Happy to share a short project write-up if that's easier than a resume.</p>
<p style="${muted}">A quick yes, no, or "talk to X" helps me plan. No hard feelings either way.</p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  4: `<div style="${baseStyle}">
<p style="${p}">{greeting}</p>
<p style="${p}">Short note — I won't take much of your time.</p>
<p style="${p}">{shortAsk}</p>
<p style="${p}">I work on production systems: APIs, databases, auth, caching, observability, and LLM infrastructure. I ship reliably and ramp fast on new codebases.</p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  5: `<div style="${baseStyle}">
<p style="${p}">{greeting}</p>
<p style="${p}">Last note from me — I don't want to keep filling your inbox.</p>
<p style="${p}">{finalAsk}</p>
<p style="${p}"><a href="${RESUME_URL}" style="${link}">View my resume</a></p>
<p style="${muted}">Wishing you a good week either way.</p>
<p style="${sig}">Kind regards,<br><strong>{senderName}</strong></p>
</div>`,
};

// Subjects resolved at enqueue/send time via jobSearchCopy
const subjectLines = {
  1: 'Job Search TP1',
  2: 'Job Search TP2',
  3: 'Job Search TP3',
  4: 'Job Search TP4',
  5: 'Job Search TP5',
};

await CampaignTemplate.deleteMany({ campaignName });

await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" campaign templates to database`);
console.log('   Role-neutral copy (HR, managers, TLs, SDEs, career inboxes)');
console.log('   Touchpoints: 5 (TP1 + TP5 include resume link)');

process.exit(0);
