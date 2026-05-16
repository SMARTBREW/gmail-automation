#!/usr/bin/env node
/**
 * Daily account-wise export for Google Sheets.
 *
 * Default: **yesterday (IST)** — sends and replies for the previous calendar day.
 *
 * Usage:
 *   npm run export-daily-report
 *   node scripts/export-daily-by-account-csv.js 2026-05-14   # optional specific IST date
 *   node scripts/export-daily-by-account-csv.js --today        # optional: today instead
 */
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { connectMongo } from '../src/db/mongo.js';
import { Campaign } from '../src/models/Campaign.js';
import { Outbox } from '../src/models/Outbox.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const HEADERS = [
  'Date (IST)',
  'Account email',
  'Executive name',
  'Campaign(s)',
  'Sent (day)',
  'Initial sent',
  'Follow-ups sent',
  'Replies (day)',
  'Total contacts',
  'Total replies (all time)',
  'Reply rate %',
  'Day highlights',
];

/** IST calendar day bounds. dayOffset: 0 = today, -1 = yesterday. */
function getIstDayBounds({ referenceDate = new Date(), dayOffset = 0 } = {}) {
  const shifted = new Date(referenceDate.getTime() + IST_OFFSET_MS);
  const dayBase = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
  dayBase.setUTCDate(dayBase.getUTCDate() + dayOffset);
  const startUtc =
    Date.UTC(
      dayBase.getUTCFullYear(),
      dayBase.getUTCMonth(),
      dayBase.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - IST_OFFSET_MS;
  const endUtc = startUtc + 24 * 60 * 60 * 1000;
  const labelDate = new Date(startUtc + IST_OFFSET_MS);
  return {
    start: new Date(startUtc),
    end: new Date(endUtc),
    label: labelDate.toISOString().slice(0, 10),
  };
}

function loadConfigAccounts() {
  try {
    const configPath = path.resolve(process.cwd(), 'config.json');
    const data = JSON.parse(readFileSync(configPath, 'utf8'));
    return (data.accounts || []).map((a) => ({
      email: (a.email || '').toLowerCase().trim(),
      displayName: a.displayName || '',
    })).filter((a) => a.email);
  } catch {
    return [];
  }
}

function formatCell(value, delimiter) {
  const s = value == null ? '' : String(value);
  if (delimiter === '\t') {
    return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatRow(values, delimiter) {
  return values.map((v) => formatCell(v, delimiter)).join(delimiter);
}

function excerpt(text, max = 120) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function firstReplyLine(replyBody, replySnippet) {
  const raw = (replyBody || replySnippet || '').replace(/\r\n/g, '\n');
  const line = raw.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || '';
  return excerpt(line, 120);
}

/** Wide column layout (character widths ≈ Google Sheets columns). */
const SHEET_COL_WIDTHS = [
  { wch: 12 },
  { wch: 36 },
  { wch: 22 },
  { wch: 52 },
  { wch: 12 },
  { wch: 13 },
  { wch: 16 },
  { wch: 13 },
  { wch: 15 },
  { wch: 20 },
  { wch: 12 },
  { wch: 58 },
];

const HTML_COL_WIDTHS = [110, 300, 175, 400, 100, 110, 135, 105, 125, 150, 105, 440];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlTable(headerRow, dataRows) {
  const colgroup = HTML_COL_WIDTHS.map(
    (w) => `<col style="min-width:${w}px;width:${w}px">`,
  ).join('');
  const th = headerRow
    .map((h) => `<th style="padding:12px 24px;text-align:left;white-space:nowrap">${escapeHtml(h)}</th>`)
    .join('');
  const trs = dataRows
    .map((row) => {
      const tds = row
        .map((cell, i) => {
          const pad = 'padding:12px 24px';
          const align = i >= 4 && i <= 10 ? 'text-align:right' : 'text-align:left';
          const wrap = i === 3 || i === 11 ? 'white-space:normal' : 'white-space:nowrap';
          return `<td style="${pad};${align};${wrap}">${escapeHtml(cell)}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Daily export</title></head>
<body style="margin:16px;font-family:Arial,sans-serif;font-size:11pt">
<p style="color:#555">Select the table below → Copy → Paste into Google Sheets at <b>A2</b></p>
<table style="border-collapse:collapse;table-layout:fixed">
<colgroup>${colgroup}</colgroup>
<thead><tr>${th}</tr></thead>
<tbody>
${trs}
</tbody>
</table>
</body></html>`;
}

function writeXlsx(filePath, headerRow, dataRows, includeHeader) {
  const aoa = includeHeader ? [headerRow, ...dataRows] : dataRows;
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = SHEET_COL_WIDTHS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily');
  XLSX.writeFile(wb, filePath);
}

function parseArgs(argv) {
  let dateArg = null;
  let outPath = null;
  let htmlPath = null;
  let xlsxPath = null;
  let useCsv = false;
  let dataOnly = false;
  let withHeader = false;
  let useToday = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      outPath = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--html' && argv[i + 1]) {
      htmlPath = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--xlsx' && argv[i + 1]) {
      xlsxPath = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--csv') {
      useCsv = true;
    } else if (argv[i] === '--data-only') {
      dataOnly = true;
    } else if (argv[i] === '--with-header') {
      withHeader = true;
    } else if (argv[i] === '--today') {
      useToday = true;
    } else if (!argv[i].startsWith('-')) {
      dateArg = argv[i];
    }
  }
  const dayOffset = dateArg ? 0 : useToday ? 0 : -1;
  const delimiter = useCsv ? ',' : '\t';
  const skipHeader = dataOnly || (!withHeader && (outPath != null || htmlPath != null || xlsxPath != null));
  return {
    dateArg,
    dayOffset,
    outPath,
    htmlPath,
    xlsxPath,
    delimiter,
    useCsv,
    skipHeader,
    dataOnly,
    useToday,
  };
}

async function main() {
  const {
    dateArg,
    dayOffset,
    outPath,
    htmlPath,
    xlsxPath: xlsxPathArg,
    delimiter,
    useCsv,
    skipHeader,
    dataOnly,
  } = parseArgs(process.argv.slice(2));

  const bounds = dateArg
    ? getIstDayBounds({ referenceDate: new Date(`${dateArg}T12:00:00+05:30`) })
    : getIstDayBounds({ dayOffset });

  console.error(`Report IST date: ${bounds.label}`);
  console.error(`Window UTC: ${bounds.start.toISOString()} → ${bounds.end.toISOString()}`);

  let xlsxPath = xlsxPathArg;
  if (!xlsxPath && (dataOnly || skipHeader)) {
    xlsxPath = `exports/daily-${bounds.label}.xlsx`;
  }

  await connectMongo();

  const configAccounts = loadConfigAccounts();
  const accountEmails = configAccounts.length
    ? configAccounts.map((a) => a.email)
    : [...new Set((await Campaign.distinct('from')).map((e) => (e || '').toLowerCase()).filter(Boolean))];

  const displayNameByEmail = new Map(configAccounts.map((a) => [a.email, a.displayName]));

  const sentInDay = await Outbox.find({
    status: 'sent',
    updatedAt: { $gte: bounds.start, $lt: bounds.end },
  })
    .select('from type updatedAt')
    .lean();

  const sentByAccount = new Map();
  for (const job of sentInDay) {
    const key = (job.from || '').toLowerCase();
    if (!key) continue;
    if (!sentByAccount.has(key)) {
      sentByAccount.set(key, { total: 0, initial: 0, followup: 0 });
    }
    const bucket = sentByAccount.get(key);
    bucket.total += 1;
    if (job.type === 'initial') bucket.initial += 1;
    else if (job.type === 'followup') bucket.followup += 1;
  }

  const repliesInDay = await Campaign.find({
    replied: true,
    repliedAt: { $gte: bounds.start, $lt: bounds.end },
  })
    .select('from to recipientName campaignName replyBody replySnippet replyFrom')
    .lean();

  const repliesByAccount = new Map();
  for (const c of repliesInDay) {
    const key = (c.from || '').toLowerCase();
    if (!key) continue;
    if (!repliesByAccount.has(key)) repliesByAccount.set(key, []);
    repliesByAccount.get(key).push(c);
  }

  const dataRows = [];

  for (const email of accountEmails) {
    const sent = sentByAccount.get(email) || { total: 0, initial: 0, followup: 0 };
    const dayReplies = repliesByAccount.get(email) || [];

    const totalContacts = await Campaign.countDocuments({ from: email });
    const totalReplied = await Campaign.countDocuments({ from: email, replied: true });
    const replyRate = totalContacts ? ((totalReplied / totalContacts) * 100).toFixed(1) : '0.0';

    const campaignNames = await Campaign.distinct('campaignName', { from: email });
    const campaigns = campaignNames.filter(Boolean).sort().join(' / ');

    const highlights = dayReplies
      .map((c) => {
        const who = c.recipientName || c.to || 'Unknown';
        const text = firstReplyLine(c.replyBody, c.replySnippet);
        return text ? `${who} — ${text}` : who;
      })
      .join(' · ');

    dataRows.push([
      bounds.label,
      email,
      displayNameByEmail.get(email) || '',
      campaigns,
      sent.total,
      sent.initial,
      sent.followup,
      dayReplies.length,
      totalContacts,
      totalReplied,
      replyRate,
      highlights || (dayReplies.length ? '(see replies)' : 'No replies that day'),
    ]);
  }

  const tsvRows = skipHeader ? [] : [formatRow(HEADERS, delimiter)];
  for (const row of dataRows) tsvRows.push(formatRow(row, delimiter));
  const body = `${tsvRows.join('\n')}\n`;

  if (outPath) {
    const resolved = path.resolve(process.cwd(), outPath);
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, body, 'utf8');
    console.error(`Wrote ${resolved}`);
  }

  const htmlOut = htmlPath || (outPath ? outPath.replace(/\.[^.]+$/, '.html') : null);
  if (htmlOut) {
    const resolvedHtml = path.resolve(process.cwd(), htmlOut);
    mkdirSync(path.dirname(resolvedHtml), { recursive: true });
    const htmlBody = buildHtmlTable(HEADERS, dataRows);
    writeFileSync(resolvedHtml, htmlBody, 'utf8');
    console.error(`Wrote ${resolvedHtml}`);
  }

  const xlsxOut = xlsxPath || (outPath ? outPath.replace(/\.[^.]+$/, '.xlsx') : null);
  if (xlsxOut) {
    const resolvedXlsx = path.resolve(process.cwd(), xlsxOut);
    mkdirSync(path.dirname(resolvedXlsx), { recursive: true });
    writeXlsx(resolvedXlsx, HEADERS, dataRows, !skipHeader);
    console.error(`Wrote ${resolvedXlsx}`);
    console.error('BEST: Google Sheets → File → Import → Upload this .xlsx → paste at A2 (columns + widths).');
  }

  if (!outPath && !htmlOut && !xlsxOut) {
    console.error(
      skipHeader
        ? 'Run: npm run export-daily-report  then import exports/daily-YYYY-MM-DD.xlsx'
        : 'Use --out, --html, or --xlsx to write a file.',
    );
  }

  process.stdout.write(body);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
