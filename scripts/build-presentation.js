#!/usr/bin/env node
/**
 * Reads presentation-data.json and builds PRESENTATION.md with all sections
 * filled. Run after: node scripts/presentation-report.js
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'presentation-data.json');

let data;
try {
  data = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch (e) {
  console.error('Run first: node scripts/presentation-report.js');
  process.exit(1);
}

const o = data.overview || {};
const exec = data.byExecutive || [];

const md = `# Outreach Presentation

**How to refresh:** Run \`npm run presentation\` (or \`node scripts/presentation-report.js\` then \`node scripts/build-presentation.js\`). Copy sections into Google Slides or use this as speaker notes.

*Generated: ${new Date().toLocaleDateString()}*

---

## 1. Overview

### Total email database
- **Total campaigns (recipients):** ${o.totalCampaigns ?? '—'}
- **Total emails sent (initial + follow-ups):** ${o.totalEmailsSent ?? '—'}
  - Initial (first touch): ${o.initialEmailsSent ?? '—'}
  - Follow-ups: ${o.followupEmailsSent ?? '—'}

### Response analysis
- **Replied:** ${o.totalReplied ?? '—'}
- **No reply yet:** ${o.totalUnreplied ?? '—'}
- **Response rate:** ${o.responseRatePct ?? '—'}%

*Replies by touchpoint (when they replied):* ${Object.entries(o.repliedByTouchpoint || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}

---

## 2. By Executive

| Executive (display name) | Email handle | Login | Campaigns shared | Replied | Response rate | Initial sent | Follow-ups sent |
|--------------------------|--------------|-------|------------------|---------|---------------|--------------|------------------|
${exec.map((e) => `| ${(e.displayName || '—')} | ${e.email} | ${e.hasLogin ? 'Yes' : 'No'} | ${e.totalCampaigns} | ${e.totalReplied} | ${e.responseRatePct}% | ${e.initialSent} | ${e.followupSent} |`).join('\n')}

*Login configured = account present in config with refresh token (ready to send).*

---

## 3. Opportunities & Threats

**Opportunities**
- [Add: e.g. Best-performing accounts, touchpoints that get replies, timing insights]
- 
- 

**Threats**
- [Add: e.g. Accounts with low response rate, deliverability risks, capacity limits]
- 
- 

---

## 4. Recommendations

1. [Add: e.g. Focus on top accounts; add more capacity where response rate is high]
2. 
3. 

---

*Data source: presentation-data.json (run \`node scripts/presentation-report.js\` to refresh).*
`;

const outPath = path.join(root, 'PRESENTATION.md');
writeFileSync(outPath, md, 'utf8');
console.log('Written:', outPath);
