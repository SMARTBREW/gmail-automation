import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
import { connectMongo } from '../db/mongo.js';
import {
  getConfiguredAccounts,
  getNextAccount,
  sendEmail,
  getThreadSummary,
  getLatestHumanReply,
  getAccountDisplayName,
} from '../services/gmailService.js';
import {
  createCampaignRecord,
  campaignsReadyForFollowup,
  advanceTouchpoint,
  getUnrepliedCampaigns,
  getTemplateForCampaign,
  markRepliedWithDetails,
} from '../services/campaignDbService.js';
import { enqueueInitial, enqueueFollowup, processOutboxOnce, cleanupOldBodies } from '../services/queueService.js';
import { Outbox } from '../models/Outbox.js';
import { AccountUsage } from '../models/AccountUsage.js';

await connectMongo();


const tools = [
  {
    name: 'get_accounts',
    description: 'List configured Gmail accounts',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => ({ accounts: getConfiguredAccounts() }),
  },
  {
    name: 'load_contacts_file',
    description: 'Load contacts from a JSON file path (array of {email} or strings)',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    handler: async ({ path }) => {
      const raw = readFileSync(path, 'utf8');
      const data = JSON.parse(raw);
      const emails = (Array.isArray(data) ? data : [])
        .map((x) => (typeof x === 'string' ? x : x.email))
        .filter(Boolean);
      return { emails };
    },
  },
  {
    name: 'send_campaign_emails',
    description: 'Send initial campaign email (touchpoint 1) to a list of contacts',
    inputSchema: {
      type: 'object',
      properties: {
        campaignName: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        // contacts can be strings (emails) or objects: { email, from?, name? }
        contacts: {
          type: 'array',
          items: {
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  from: { type: 'string' },   // owner email (must exist in config.json)
                  name: { type: 'string' },
                },
                required: ['email'],
                additionalProperties: true,
              },
            ],
          },
        },
        accountEmail: { type: 'string' }, // optional default if per-contact 'from' not provided
      },
      required: ['campaignName', 'subject', 'body', 'contacts'],
    },
    handler: async ({ campaignName, subject, body, contacts, accountEmail }) => {
      const results = [];
      const configured = getConfiguredAccounts();
      for (const entry of contacts) {
        const to = typeof entry === 'string' ? entry : entry.email;
        const requestedFrom = typeof entry === 'string' ? undefined : entry.from;
        // Extract recipientName from contact object if available
        const recipientName = typeof entry === 'object' && entry.name ? entry.name : '';
        // Per-contact owner precedence → fallback to provided accountEmail → reject if unknown
        const from = requestedFrom || accountEmail;
        if (!from) {
          results.push({ to, status: 'failed', error: 'No owner specified (from/accountEmail).' });
          continue;
        }
        if (!configured.includes(from)) {
          results.push({ to, status: 'failed', error: `Owner email not in config.json: ${from}` });
          continue;
        }
        await enqueueInitial({ from, to, subject, body, campaignName, recipientName });
        results.push({ to, from, status: 'queued', recipientName: recipientName || 'not provided' });
      }
      return { queued: results.length, results };
    },
  },
  {
    name: 'send_followups',
    description: 'Send next follow-up (touchpoints 2-7) to all ready campaigns',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (args = {}) => {
      const testMode = args.testMode || process.env.TEST_MODE === 'true';
      const ready = await campaignsReadyForFollowup(testMode);
      const results = [];
      for (const c of ready) {
        const reply = await getLatestHumanReply({
          fromEmail: c.from,
          threadId: c.threadId,
          recipientEmail: c.to,
          outboundSubject: c.subject || null,
          internetMessageId: c.internetMessageId || null,
          lastSent: c.lastSent || null,
        });
        if (reply) {
          await markRepliedWithDetails({ campaignId: c._id, reply });
          results.push({ id: c._id, to: c.to, status: 'replied' });
          continue;
        }
        const nextTouch = (c.touchpoint || 1) + 1;
        
        // Use stored recipientName from campaign (no need to parse from HTML body)
        const recipientName = c.recipientName || '';
        
        const template = await getTemplateForCampaign(c.campaignName);
        const templateBody = template.templates[nextTouch];
        const templateSubject = template.subjectLines[nextTouch];
        
        let body = templateBody;
        if (recipientName) {
          body = body.replace(/{recipientName}/g, recipientName);
        } else {
          body = body.replace(/Dear {recipientName},/g, 'Hello,');
          body = body.replace(/{recipientName}/g, '');
        }
        body = body.replace(/{senderName}/g, c.displayName || getAccountDisplayName(c.from));
        
        const subject = `Re: ${c.subject || templateSubject}`;
        

        const firstMessageId = c.internetMessageId || c.messageIds?.[0];
        if (!firstMessageId) {
          console.warn(`⚠️  No Internet Message-ID found for campaign ${c._id}, skipping follow-up`);
          continue;
        }
        
        const allMessageIds = c.allInternetMessageIds || [firstMessageId];
        const referencesArray = allMessageIds.map(id => 
          id.startsWith('<') ? id : `<${id}>`
        );
        const references = referencesArray.join(' ');
        const inReplyTo = firstMessageId.startsWith('<') ? firstMessageId : `<${firstMessageId}>`;
        
        await enqueueFollowup({
          from: c.from,
          to: c.to,
          subject,
          body,
          headers: { threadId: c.threadId, inReplyTo, references },
          campaignId: c._id,
          originalSubject: c.subject,
        });
        results.push({ id: c._id, to: c.to, status: 'queued', touchpoint: nextTouch });
      }
      return { processed: results.length, results };
    },
  },
  {
    name: 'check_replies',
    description: 'Check all unreplied campaigns for replies and mark replied',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const unreplied = await getUnrepliedCampaigns();
      let repliedCount = 0;
      for (const c of unreplied) {
        const reply = await getLatestHumanReply({
          fromEmail: c.from,
          threadId: c.threadId,
          recipientEmail: c.to,
          outboundSubject: c.subject || null,
          internetMessageId: c.internetMessageId || null,
          lastSent: c.lastSent || null,
        });
        if (reply) {
          await markRepliedWithDetails({ campaignId: c._id, reply });
          repliedCount++;
        }
      }
      return { checked: unreplied.length, replied: repliedCount };
    },
  },
  {
    name: 'process_outbox',
    description: 'Process a batch of queued emails respecting per-account limits',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const res = await processOutboxOnce();
      return res;
    },
  },
  {
    name: 'queue_stats',
    description: 'Get queue stats grouped by account and status',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const agg = await Outbox.aggregate([
        { $group: { _id: { from: '$from', status: '$status' }, count: { $sum: 1 } } },
        { $sort: { '_id.from': 1 } },
      ]);
      return { stats: agg };
    },
  },
  {
    name: 'usage_stats',
    description: 'Get per-account usage (sentToday, resetAt)',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const docs = await AccountUsage.find({}).lean();
      return { usage: docs.map(d => ({ email: d.email, sentToday: d.sentToday, resetAt: d.resetAt })) };
    },
  },
  {
    name: 'retry_job',
    description: 'Retry a specific job by id (set pending, notBefore=now)',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => {
      await Outbox.findByIdAndUpdate(id, { $set: { status: 'pending', notBefore: new Date() }, $unset: { claimedAt: '', workerId: '' } });
      return { ok: true };
    },
  },
  {
    name: 'cancel_job',
    description: 'Cancel a job by id (mark failed)',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => {
      await Outbox.findByIdAndUpdate(id, { $set: { status: 'failed', lastError: 'cancelled' }, $unset: { claimedAt: '', workerId: '' } });
      return { ok: true };
    },
  },
  {
    name: 'requeue_failed',
    description: 'Requeue all failed jobs for an account',
    inputSchema: { type: 'object', properties: { from: { type: 'string' } }, required: ['from'] },
    handler: async ({ from }) => {
      const res = await Outbox.updateMany(
        { from, status: 'failed' },
        { $set: { status: 'pending', notBefore: new Date() }, $unset: { claimedAt: '', workerId: '' } }
      );
      return { matched: res.matchedCount ?? res.n, modified: res.modifiedCount ?? res.nModified };
    },
  },
];

function encodeMessage(obj) {
  const json = JSON.stringify(obj);
  const bytes = Buffer.from(json, 'utf8');
  const header = `Content-Length: ${bytes.length}\r\n\r\n`;
  process.stdout.write(header);
  process.stdout.write(bytes);
}

async function handleRequest(req) {
  const { id, method, params } = req || {};
  try {
    if (method === 'ping') {
      encodeMessage({ jsonrpc: '2.0', id, result: { pong: true } });
      return;
    }
    if (method === 'initialize') {
      encodeMessage({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'mcp-gmail-outreach', version: '1.0.0' },
          capabilities: { tools: { list: true, call: true } },
        },
      });
      return;
    }
    if (method === 'tools/list') {
      encodeMessage({ jsonrpc: '2.0', id, result: { tools: tools.map(({ handler, ...rest }) => rest) } });
      return;
    }
    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments || {};
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      const out = await tool.handler(args);
      encodeMessage({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) },
          ],
        },
      });
      return;
    }
    encodeMessage({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (e) {
    encodeMessage({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message || 'Internal error' } });
  }
}

let buffer = Buffer.alloc(0);
let expected = null;

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expected == null) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = buffer.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
      expected = parseInt(match[1], 10);
      buffer = buffer.slice(headerEnd + 4);
    }
    if (buffer.length < expected) break;
    const body = buffer.slice(0, expected).toString('utf8');
    buffer = buffer.slice(expected);
    expected = null;
    try { const req = JSON.parse(body); handleRequest(req); } catch {}
  }
});

// Handle stdin close: only exit if we're in interactive MCP mode
// When running as a background worker (PM2), stdin closes but we should keep the worker alive
// PM2 runs processes without a TTY, so !isTTY means we're in worker mode
const isWorkerMode = !process.stdin.isTTY || process.env.RUN_AS_WORKER === 'true';
if (isWorkerMode && process.env.RESUME_TRACKING_ENABLED === 'true') {
  const { startTrackingServer } = await import('../trackingServer.js');
  startTrackingServer();
}
if (!isWorkerMode) {
  // Only exit on stdin close if we're in interactive MCP protocol mode
  process.stdin.on('end', () => process.exit(0));
} else {
  // In worker mode, ignore stdin close - keep the process alive
  process.stdin.on('end', () => {
    console.log('⚠️  stdin closed (worker mode - keeping process alive)');
  });
}
console.log('🧩 MCP stdio server ready' + (isWorkerMode ? ' (worker mode)' : ' (MCP protocol mode)'));

// Background worker: process outbox periodically
// Poll outbox every 3 seconds to check for new jobs (sending respects minIntervalMs from config)
const OUTBOX_POLL_MS = parseInt(process.env.OUTBOX_POLL_MS || '3000', 10);
setInterval(async () => {
  try {
    await processOutboxOnce();
  } catch {}
}, OUTBOX_POLL_MS);

// Background cleanup: remove HTML bodies from old outbox records (every 10 minutes)
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
setInterval(async () => {
  try {
    await cleanupOldBodies();
  } catch (err) {
    console.error('Error cleaning up old bodies:', err.message);
  }
}, CLEANUP_INTERVAL_MS);

// Run cleanup once on startup after 1 minute
setTimeout(async () => {
  try {
    await cleanupOldBodies();
  } catch {}
}, 60000);
