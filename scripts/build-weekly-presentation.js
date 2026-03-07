#!/usr/bin/env node
/**
 * Builds WEEKLY_PRESENTATION.md from weekly-presentation-data.json
 * One section per week, ready to paste into slides.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'weekly-presentation-data.json');

let data;
try {
    data = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch (e) {
    console.error('Run first: node scripts/weekly-presentation-report.js');
    process.exit(1);
}

const allWeeks = data.weeks || [];
const weeks = allWeeks.length > 0 ? [allWeeks[allWeeks.length - 1]] : [];
const lines = [];

lines.push(
    '# Week-wise Outreach Presentation',
    '',
    '**How to refresh:** Run `npm run weekly-presentation` (or `node scripts/weekly-presentation-report.js` then `node scripts/build-weekly-presentation.js`). Copy each week into 1–2 slides.',
    '',
    `*Generated: ${new Date().toLocaleDateString()}*`,
    '',
    '---',
    ''
);

for (const w of weeks) {
    const o = w.overview || {};
    lines.push(
        `## Week ${w.start} to ${w.end}`,
        '',
        '### 1. Overview',
        '',
        `- **Total email db:** ${o.cumulativeCampaigns ?? '—'}`,
        '',
        '**Response analysis:**',
        `- Replies this week: ${o.repliesThisWeek ?? '—'}`,
        `- Cumulative replies: ${o.cumulativeReplied ?? '—'}`,
        `- Cumulative response rate: ${o.cumulativeResponseRatePct ?? '—'}%`,
        '',
        '### 2. By Executive (this week)',
        ''
    );

    const exec = w.byExecutive || [];
    if (exec.length === 0) {
        lines.push('_No activity this week._', '');
    } else {
        lines.push(
            '| Executive | Email | Login Details | Total Email Shared (Week) | Replies (Week) | Cum. Response Rate |',
            '|-----------|-------|---------------|--------------------------|----------------|---------------------|'
        );
        for (const e of exec) {
            const weekEmails = (e.initialSent || 0) + (e.followupSent || 0);
            lines.push(
                `| ${e.displayName || '—'} | ${e.email} | ${e.loginDetails || '—'} | ${weekEmails} | ${e.repliesThisWeek} | ${e.cumulativeResponseRatePct}% |`
            );
        }
        lines.push('');
    }

    // --- Automated Insights Logic ---
    const opportunities = [];
    const threats = [];
    const recommendations = [];

    const topExec = exec.length > 0 ? [...exec].sort((a, b) => parseFloat(b.cumulativeResponseRatePct) - parseFloat(a.cumulativeResponseRatePct))[0] : null;
    const highVolumeExec = exec.length > 0 ? [...exec].sort((a, b) => ((b.initialSent || 0) + (b.followupSent || 0)) - ((a.initialSent || 0) + (a.followupSent || 0)))[0] : null;

    // Opportunities
    if (topExec && parseFloat(topExec.cumulativeResponseRatePct) > 15) {
        opportunities.push(`- **High conversion potential:** ${topExec.displayName || topExec.email} has a ${topExec.cumulativeResponseRatePct}% all-time response rate. Scale their volume.`);
    }
    if (o.newCampaigns > 50) {
        opportunities.push(`- **Database growth:** ${o.newCampaigns} new campaigns added this week provides fresh leads for the pipeline.`);
    } else {
        opportunities.push(`- **Untapped Capacity:** Current outreach volume is low (${o.totalEmailsSent} emails); opportunity to scale up to previous peaks.`);
    }

    // Threats
    if (o.repliesThisWeek === 0 && o.totalEmailsSent > 50) {
        threats.push('- **Engagement Gap:** Zero replies received this week despite outreach. Check for template fatigue or spam filters.');
    }
    if (o.newCampaigns < 10) {
        threats.push(`- **Lead Stagnation:** Very few new campaigns added (${o.newCampaigns}); potential for outreach to dry up soon.`);
    }
    const missingLogins = exec.filter(e => !e.hasLogin).length;
    if (missingLogins > 0) {
        threats.push(`- **Configuration Risk:** ${missingLogins} executive(s) are active but missing login configurations.`);
    }

    // Recommendations
    if (o.newCampaigns < 20) {
        recommendations.push('1. **Lead Gen Sprint:** Prioritize adding at least 100+ new leads/campaigns to the database.');
    }
    if (o.totalEmailsSent < 300) {
        recommendations.push('2. **Volume Increase:** Aim to increase weekly outreach to 500+ emails to maintain momentum.');
    }
    if (o.repliesThisWeek === 0) {
        recommendations.push('3. **A/B Testing:** Refresh email subject lines or initial templates to jumpstart engagement.');
    } else {
        recommendations.push('3. **Executive Coaching:** Have high-performing executives share their successful templates with the team.');
    }

    lines.push(
        '### 3. Opportunities & Threats (for this week)',
        '',
        '**Opportunities**',
        opportunities.length > 0 ? opportunities.join('\n') : '- [No major opportunities identified this week]',
        '',
        '**Threats**',
        threats.length > 0 ? threats.join('\n') : '- [No major threats identified this week]',
        '',
        '### 4. Recommendations (for this week)',
        '',
        recommendations.length > 0 ? recommendations.join('\n') : '1. Maintain current pace and monitor deliverability.',
        '',
        '---',
        ''
    );
}

const outPath = path.join(root, 'WEEKLY_PRESENTATION.md');
writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log('Written:', outPath);
