#!/usr/bin/env node
/**
 * Weekly outreach report:
 * - Buckets activity by week (Mon–Sun, UTC)
 * - Overview per week + per-executive weekly and cumulative stats
 * - Writes: weekly-presentation-data.json at repo root
 */
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadConfigSafe() {
    try {
        const configPath = path.resolve(process.cwd(), 'config.json');
        const data = JSON.parse(readFileSync(configPath, 'utf8'));
        return data.accounts || [];
    } catch {
        return [];
    }
}

// Week key = Monday (UTC) YYYY-MM-DD; we also return start/end Date objects.
function getWeekInfo(date, now) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const day = d.getUTCDay(); // 0 Sun, 1 Mon, ...

    // Standard Monday (1) to Sunday (0) week
    const diffToMonday = (day + 6) % 7;

    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
    monday.setUTCHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    let end = sunday;
    if (now && now < end) {
        end = now;
    }

    const key = monday.toISOString().slice(0, 10);
    return { key, start: monday, end: end };
}

async function main() {
    await connectMongo();

    const now = new Date();
    const configAccounts = loadConfigSafe();
    const configuredEmails = new Set(
        configAccounts.map((a) => (a.email || '').toLowerCase().trim())
    );

    const weeks = new Map(); // key -> { key, start, end, overview, byExecutive: Map }

    function getWeekBucket(date) {
        const info = getWeekInfo(date, now);
        if (!info) return null;
        let bucket = weeks.get(info.key);
        if (!bucket) {
            bucket = {
                key: info.key,
                start: info.start,
                end: info.end,
                overview: {
                    newCampaigns: 0,
                    initialEmailsSent: 0,
                    followupEmailsSent: 0,
                    repliesThisWeek: 0,
                    totalEmailsSent: 0,
                    cumulativeCampaigns: 0,
                    cumulativeReplied: 0,
                    cumulativeResponseRatePct: '0.0',
                },
                byExecutive: new Map(),
            };

            // Pre-populate with all configured accounts
            for (const cfg of configAccounts) {
                const email = (cfg.email || '').toLowerCase().trim();
                bucket.byExecutive.set(email, {
                    email: email,
                    displayName: cfg.displayName || null,
                    loginDetails: cfg.loginDetails || '—',
                    hasLogin: true,
                    newCampaigns: 0,
                    initialSent: 0,
                    followupSent: 0,
                    repliesThisWeek: 0,
                    cumulativeCampaigns: 0,
                    cumulativeReplied: 0,
                    cumulativeResponseRatePct: '0.0',
                });
            }
            weeks.set(info.key, bucket);
        }
        return bucket;
    }

    function getExecStats(bucket, email) {
        const key = (email || '(unknown)').toLowerCase().trim();
        let stats = bucket.byExecutive.get(key);
        if (!stats) {
            const cfg = configAccounts.find(
                (a) => (a.email || '').toLowerCase().trim() === key
            );
            stats = {
                email: key,
                displayName: cfg?.displayName || null,
                loginDetails: cfg?.loginDetails || '—',
                hasLogin: !!cfg,
                newCampaigns: 0,
                initialSent: 0,
                followupSent: 0,
                repliesThisWeek: 0,
                cumulativeCampaigns: 0,
                cumulativeReplied: 0,
                cumulativeResponseRatePct: '0.0',
            };
            bucket.byExecutive.set(key, stats);
        }
        return stats;
    }

    // Load data (size is manageable for in-memory)
    const campaigns = await Campaign.find({})
        .select('from replied createdAt updatedAt')
        .lean();
    const outbox = await Outbox.find({ status: 'sent' })
        .select('type from createdAt updatedAt')
        .lean();

    // 1) New campaigns = “email DB added this week”
    for (const c of campaigns) {
        const b = getWeekBucket(c.createdAt);
        if (!b) continue;
        b.overview.newCampaigns += 1;
        const e = getExecStats(b, c.from);
        e.newCampaigns += 1;
    }

    // 2) Replies this week (when reply got marked, using updatedAt)
    for (const c of campaigns) {
        if (!c.replied || !c.updatedAt) continue;
        const b = getWeekBucket(c.updatedAt);
        if (!b) continue;
        b.overview.repliesThisWeek += 1;
        const e = getExecStats(b, c.from);
        e.repliesThisWeek += 1;
    }

    // 3) Emails sent (initial + follow-ups) this week
    for (const job of outbox) {
        const when = job.updatedAt || job.createdAt;
        const b = getWeekBucket(when);
        if (!b) continue;
        const e = getExecStats(b, job.from);
        if (job.type === 'initial') {
            b.overview.initialEmailsSent += 1;
            e.initialSent += 1;
        } else if (job.type === 'followup') {
            b.overview.followupEmailsSent += 1;
            e.followupSent += 1;
        }
    }

    // 4) Compute weekly totals & cumulative stats (overall + per exec)
    const sortedWeeks = Array.from(weeks.values()).sort(
        (a, b) => a.start - b.start
    );

    let cumCampaignsTotal = 0;
    let cumRepliedTotal = 0;
    const cumCampaignsByExec = new Map();
    const cumRepliedByExec = new Map();

    for (const w of sortedWeeks) {
        const o = w.overview;
        o.totalEmailsSent = (o.initialEmailsSent || 0) + (o.followupEmailsSent || 0);

        cumCampaignsTotal += o.newCampaigns || 0;
        cumRepliedTotal += o.repliesThisWeek || 0;

        o.cumulativeCampaigns = cumCampaignsTotal;
        o.cumulativeReplied = cumRepliedTotal;
        o.cumulativeResponseRatePct = o.cumulativeCampaigns
            ? ((cumRepliedTotal * 100) / o.cumulativeCampaigns).toFixed(1)
            : '0.0';

        for (const [email, stats] of w.byExecutive.entries()) {
            const prevC = cumCampaignsByExec.get(email) || 0;
            const prevR = cumRepliedByExec.get(email) || 0;
            const nextC = prevC + (stats.newCampaigns || 0);
            const nextR = prevR + (stats.repliesThisWeek || 0);

            cumCampaignsByExec.set(email, nextC);
            cumRepliedByExec.set(email, nextR);

            stats.cumulativeCampaigns = nextC;
            stats.cumulativeReplied = nextR;
            stats.cumulativeResponseRatePct = nextC
                ? ((nextR * 100) / nextC).toFixed(1)
                : '0.0';
        }
    }

    const allWeeksReport = sortedWeeks.map((w) => ({
        key: w.key,
        start: w.start.toISOString().slice(0, 10),
        end: w.end.toISOString().slice(0, 10),
        overview: w.overview,
        byExecutive: Array.from(w.byExecutive.values()),
    }));

    const report = {
        generatedAt: new Date().toISOString(),
        weeks: allWeeksReport.length > 0 ? [allWeeksReport[allWeeksReport.length - 1]] : [],
    };

    const outPath = path.join(process.cwd(), 'weekly-presentation-data.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('Weekly report written to:', outPath);

    // Close connection and exit
    const mongoose = (await import('mongoose')).default;
    await mongoose.connection.close();
    process.exit(0);
}

main().catch(async (e) => {
    console.error('Error:', e);
    const mongoose = (await import('mongoose')).default;
    await mongoose.connection.close();
    process.exit(1);
});
