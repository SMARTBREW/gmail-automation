#!/usr/bin/env node
/**
 * Remove false duplicate reply records caused by loose inbox subject matching.
 *
 * For each cluster of campaigns sharing the same Gmail reply (message id,
 * sender+minute, or body text on one account), keeps one record and clears the rest.
 *
 * Usage:
 *   node bin/cleanup-duplicate-replies.js --dry-run
 *   node bin/cleanup-duplicate-replies.js
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';

const dryRun = process.argv.includes('--dry-run');

function normEmail(value) {
  const raw = String(value || '').toLowerCase();
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

function replySender(c) {
  return normEmail(c.replyEmail || c.replyFrom);
}

function senderMatchesContact(c) {
  const sender = replySender(c);
  const to = normEmail(c.to);
  return Boolean(sender && to && sender === to);
}

function bodyKey(c) {
  return String(c.replyBody || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function minuteKey(c) {
  if (!c.repliedAt) return '0';
  return String(Math.floor(new Date(c.repliedAt).getTime() / 60000));
}

/** Pick the campaign that should keep the reply attribution. */
function pickKeeper(campaigns) {
  const withMatch = campaigns.filter(senderMatchesContact);
  if (withMatch.length === 1) return withMatch[0];
  if (withMatch.length > 1) {
    return withMatch.sort(
      (a, b) => new Date(b.repliedAt || 0) - new Date(a.repliedAt || 0),
    )[0];
  }
  // Alternate sender (EA, etc.): keep contact we emailed if reply is in their thread only — prefer earliest lastSent + has thread
  return campaigns.sort((a, b) => {
    const aScore = (a.threadId ? 1 : 0) + (a.lastSent ? 1 : 0);
    const bScore = (b.threadId ? 1 : 0) + (b.lastSent ? 1 : 0);
    if (bScore !== aScore) return bScore - aScore;
    return new Date(b.repliedAt || 0) - new Date(a.repliedAt || 0);
  })[0];
}

function clusterKey(c, mode) {
  const from = normEmail(c.from);
  if (mode === 'messageId') {
    const mid = String(c.replyMessageId || '').trim();
    if (!mid) return null;
    return `mid|${from}|${mid}`;
  }
  if (mode === 'senderMinute') {
    const sender = replySender(c);
    if (!sender || !c.repliedAt) return null;
    return `sm|${from}|${sender}|${minuteKey(c)}`;
  }
  if (mode === 'body') {
    const bk = bodyKey(c);
    if (bk.length < 40) return null;
    return `body|${from}|${bk}`;
  }
  return null;
}

async function clearDuplicates(ids) {
  if (!ids.length) return 0;
  if (dryRun) return ids.length;
  const result = await Campaign.updateMany(
    { _id: { $in: ids } },
    {
      $set: { replied: false },
      $unset: {
        repliedAt: '',
        replyFrom: '',
        replyEmail: '',
        replySubject: '',
        replySnippet: '',
        replyBody: '',
        replyMessageId: '',
      },
    },
  );
  return result.modifiedCount;
}

async function processClusters(campaigns, mode, seenIds, stats) {
  const groups = new Map();
  for (const c of campaigns) {
    if (seenIds.has(String(c._id))) continue;
    const key = clusterKey(c, mode);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const keeper = pickKeeper(group);
    const toClear = group.filter((c) => String(c._id) !== String(keeper._id));
    for (const c of toClear) {
      seenIds.add(String(c._id));
      stats.cleared += 1;
      stats.byAccount[c.from] = (stats.byAccount[c.from] || 0) + 1;
      if (stats.samples.length < 8) {
        stats.samples.push({
          mode,
          kept: keeper.to,
          removed: c.to,
          sender: replySender(keeper),
          account: keeper.from,
        });
      }
    }
  }
}

async function main() {
  await connectMongo();

  const withBody = await Campaign.find({
    replied: true,
    replyBody: { $exists: true, $type: 'string', $ne: '' },
  })
    .select('_id to from repliedAt replyFrom replyEmail replyBody replyMessageId threadId lastSent')
    .lean();

  const beforeReplied = await Campaign.countDocuments({ replied: true });
  const beforeWithBody = withBody.length;

  const seenIds = new Set();
  const stats = { cleared: 0, byAccount: {}, samples: [] };

  // Message-ID clusters first (strongest signal)
  await processClusters(withBody, 'messageId', seenIds, stats);
  // Same sender + minute on one account
  await processClusters(withBody, 'senderMinute', seenIds, stats);
  // Same body text copied onto many contacts
  await processClusters(withBody, 'body', seenIds, stats);

  const idsToClear = [...seenIds];
  const modified = await clearDuplicates(idsToClear);

  const afterReplied = dryRun
    ? beforeReplied - stats.cleared
    : await Campaign.countDocuments({ replied: true });
  const afterWithBody = dryRun
    ? beforeWithBody - stats.cleared
    : await Campaign.countDocuments({
        replied: true,
        replyBody: { $exists: true, $type: 'string', $ne: '' },
      });

  console.log(dryRun ? 'DRY RUN — no database changes\n' : 'Cleanup complete\n');
  console.log(`Marked replied before:     ${beforeReplied}`);
  console.log(`With reply body before:  ${beforeWithBody}`);
  console.log(`Duplicate rows cleared:  ${stats.cleared}`);
  if (!dryRun) console.log(`MongoDB modified:        ${modified}`);
  console.log(`Marked replied after:      ${afterReplied}`);
  console.log(`With reply body after:   ${afterWithBody}`);

  console.log('\nBy account:');
  for (const [email, count] of Object.entries(stats.byAccount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${email}: ${count}`);
  }

  if (stats.samples.length) {
    console.log('\nSample fixes (kept → removed):');
    for (const s of stats.samples) {
      console.log(`  [${s.mode}] ${s.account}: kept ${s.kept}, cleared ${s.removed} (reply from ${s.sender})`);
    }
  }

  if (dryRun) {
    console.log('\nRun without --dry-run to apply changes.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
