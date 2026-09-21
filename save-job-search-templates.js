import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
import { JOB_SEARCH_CAMPAIGN } from './src/services/personalCampaignConfig.js';

await connectMongo();

const campaignName = JOB_SEARCH_CAMPAIGN;

const RESUME_URL = 'https://drive.google.com/file/d/17Dqpul2EjBejrK4CZuSywHHc0fjFPU_U/view';
const SMARTSPIDY_URL = 'https://smartspidy.smartbrew.in/';
const SMARTROUTE_URL = 'https://github.com/Ayush701-code-zm/LLM-Gatway';
const EXYNTRA_URL = 'http://exyntra.com/';
const GIVING_CIRCLE_URL = 'https://thegivingcircle.in/';

const baseStyle = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #202124; max-width: 620px;`;

const p = 'margin: 0 0 14px 0;';
const sig = 'margin: 20px 0 0 0; color: #202124;';
const link = 'color: #1a73e8; text-decoration: none; font-weight: 500;';
const muted = 'margin: 0 0 14px 0; color: #5f6368; font-size: 14px;';
const tldrBox = 'margin: 0 0 18px 0; padding: 12px 14px; background: #f8f9fa; border-left: 3px solid #202124;';

const templates = {
  1: `<div style="${baseStyle}">
<div style="${tldrBox}">
<p style="margin: 0 0 6px 0;"><strong>tldr;</strong></p>
<p style="margin: 0;">{tldr}</p>
</div>
<p style="${p}">{greeting}</p>
<p style="${p}">{openingLine}</p>
<p style="${p}">I've been heads-down building production systems at <strong>SmartBrew</strong>, the kind of work where reliability actually matters. A few things I shipped:</p>
<p style="${p}"><strong><a href="${SMARTSPIDY_URL}" style="${link}">SmartSpidy</a></strong>: document ingestion, embeddings, and AI-assisted outreach that runs at scale.<br>
<strong><a href="${SMARTROUTE_URL}" style="${link}">SmartRoute AI</a></strong>: an LLM gateway with semantic caching, rate limiting, async workers, and auth. The infrastructure that makes AI products usable.</p>
<p style="${p}">I've also shipped production platforms end-to-end: <strong><a href="${EXYNTRA_URL}" style="${link}">Exyntra</a></strong> (enterprise technology and AI transformation) and <strong><a href="${GIVING_CIRCLE_URL}" style="${link}">The Giving Circle</a></strong> (trusted donation / NGO impact platform in India).</p>
<p style="${p}">My strongest suit is owning the messy middle: backend systems (Node, Postgres), reliability, and LLM/AI infrastructure, from idea to something people depend on. I care less about titles and more about being on a team that's building something real.</p>
<p style="${p}">{askLine}</p>
<p style="${p}"><a href="${RESUME_URL}" style="${link}">View my resume</a></p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  2: `<div style="${baseStyle}">
<div style="${tldrBox}">
<p style="margin: 0 0 6px 0;"><strong>tldr;</strong></p>
<p style="margin: 0;">Still very interested in <strong>{company}</strong>. If you're hiring engineers, or know who owns that, I'd love a short conversation.</p>
</div>
<p style="${p}">{greeting}</p>
<p style="${p}">{followUpIntro}</p>
<p style="${p}">{followUpAsk}</p>
<p style="${p}">What I bring: I ship production systems end-to-end. APIs, data/LLM pipelines, auth, caching, workers, and I stay with them until they hold under load. I'm looking for hard problems and a lean team where I can contribute quickly.</p>
<p style="${p}"><a href="${RESUME_URL}" style="${link}">View my resume</a> · <a href="${SMARTSPIDY_URL}" style="${link}">SmartSpidy</a> · <a href="${SMARTROUTE_URL}" style="${link}">SmartRoute AI</a></p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  3: `<div style="${baseStyle}">
<div style="${tldrBox}">
<p style="margin: 0 0 6px 0;"><strong>tldr;</strong></p>
<p style="margin: 0;"><strong>{company}</strong> is still high on my list. Happy to chat, take a referral, or hear if timing isn't right.</p>
</div>
<p style="${p}">{greeting}</p>
<p style="${p}">{circleBackAsk}</p>
<p style="${p}">I've built things people use: <a href="${EXYNTRA_URL}" style="${link}">Exyntra</a>, <a href="${GIVING_CIRCLE_URL}" style="${link}">The Giving Circle</a>, plus AI infra at SmartBrew (<a href="${SMARTSPIDY_URL}" style="${link}">SmartSpidy</a>, <a href="${SMARTROUTE_URL}" style="${link}">SmartRoute AI</a>). I own the stack from idea to production.</p>
<p style="${p}">A short call, a referral, or even a quick "not right now" would all help. Totally understand either way.</p>
<p style="${p}"><a href="${RESUME_URL}" style="${link}">View my resume</a></p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,

  4: `<div style="${baseStyle}">
<div style="${tldrBox}">
<p style="margin: 0 0 6px 0;"><strong>tldr;</strong></p>
<p style="margin: 0;">Last note from me on this thread. Still interested in <strong>{company}</strong>, and grateful for any reply when you have a moment.</p>
</div>
<p style="${p}">{greeting}</p>
<p style="${p}">{finalAsk}</p>
<p style="${p}">I build backend and AI infrastructure for production. I'd love to be heads down on a hard problem with a team that cares about shipping. If that's close to what you're hiring for, I'd be glad to talk.</p>
<p style="${p}"><a href="${RESUME_URL}" style="${link}">View my resume</a></p>
<p style="${muted}">No pressure at all. Thanks for reading this far.</p>
<p style="${sig}">Best,<br><strong>{senderName}</strong></p>
</div>`,
};

const subjectLines = {
  1: 'Job Search TP1',
  2: 'Job Search TP2',
  3: 'Job Search TP3',
  4: 'Job Search TP4',
};

await CampaignTemplate.deleteMany({ campaignName });

await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" — softer tone, no em dashes`);
process.exit(0);
