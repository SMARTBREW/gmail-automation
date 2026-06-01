import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache OAuth2 clients and Gmail API clients per account (permanent optimization)
// Store both client and refreshToken to detect when token changes
const oauth2ClientCache = new Map(); // email -> { client: OAuth2Client, refreshToken: string }
const gmailClientCache = new Map(); // email -> { client: Gmail API client, refreshToken: string }

function getOAuth2Client(email, refreshToken) {
  // Check if cached client exists and token matches
  const cached = oauth2ClientCache.get(email);
  if (cached && cached.refreshToken === refreshToken) {
    return cached.client;
  }
  // Create new client and cache it with the token
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });
  oauth2ClientCache.set(email, { client: oauth2Client, refreshToken });
  return oauth2Client;
}

export function getGmailClient(email, refreshToken) {
  // Check if cached client exists and token matches
  const cached = gmailClientCache.get(email);
  if (cached && cached.refreshToken === refreshToken) {
    return cached.client;
  }
  // Create new Gmail client and cache it with the token (reuses OAuth2 client)
  const oauth2Client = getOAuth2Client(email, refreshToken);
  const gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
  gmailClientCache.set(email, { client: gmailClient, refreshToken });
  return gmailClient;
}

// Cache config.json reads (shared with queueService pattern)
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 30 * 1000; // 30 seconds

function loadConfig() {
  const now = Date.now();
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  try {
    const configPath = join(__dirname, '../../config.json');
    configCache = JSON.parse(readFileSync(configPath, 'utf8'));
    configCacheTime = now;
    return configCache;
  } catch (error) {
    throw new Error(`Failed to load config.json: ${error.message}`);
  }
}

export function getAccountByEmail(email) {
  const config = loadConfig();
  const account = config.accounts.find(acc => acc.email === email);
  if (!account) {
    throw new Error(`Account not found: ${email}`);
  }
  return account;
}

let accountRotationIndex = 0;
export function getNextAccount() {
  const config = loadConfig();
  if (config.accounts.length === 0) {
    throw new Error('No accounts configured');
  }
  const account = config.accounts[accountRotationIndex % config.accounts.length];
  accountRotationIndex++;
  return account;
}

export function getAccountDisplayName(email) {
  const acc = getAccountByEmail(email);
  return acc.displayName || '';
}

function createEmailMessage(fromEmail, to, subject, body, { inReplyTo, references, displayName } = {}) {
  // Prefer displayName from config.json; fallback to bare email local-part
  const safeDisplay = (displayName && String(displayName).trim()) || '';
  const fromHeader = safeDisplay ? `"${safeDisplay}" <${fromEmail}>` : fromEmail;
  const message = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references ? [`References: ${references}`] : []),
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ].join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return encodedMessage;
}

// Cache send-as verification per account to avoid API calls on every email
const sendAsCache = new Map(); // email -> { verified: boolean, lastChecked: Date }
const SEND_AS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes - only check once per 5 minutes per account

async function ensureCorrectSendAsDefault(gmail, targetEmail) {
  const now = new Date();
  const cached = sendAsCache.get(targetEmail);
  
  // Use cache if verified recently (within TTL)
  if (cached && cached.verified && (now - cached.lastChecked) < SEND_AS_CACHE_TTL_MS) {
    return true; // Skip API call - already verified recently
  }
  
  try {
    const sendAsResponse = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const sendAsAddresses = sendAsResponse.data.sendAs || [];
    const targetSendAs = sendAsAddresses.find(
      sa => sa.sendAsEmail?.toLowerCase() === targetEmail.toLowerCase()
    );
    if (!targetSendAs) {
      console.warn(`  Warning: ${targetEmail} not found in "Send mail as" settings. Email may be sent from default alias.`);
      sendAsCache.set(targetEmail, { verified: false, lastChecked: now });
      return false;
    }
    // Also ensure displayName matches config.json
    const desiredDisplayName = getAccountDisplayName(targetEmail) || targetSendAs.displayName || '';
    const needsDefault = !targetSendAs.isDefault;
    const needsName = (desiredDisplayName && targetSendAs.displayName !== desiredDisplayName);

    if (!needsDefault && !needsName) {
      // Cache the successful verification
      sendAsCache.set(targetEmail, { verified: true, lastChecked: now });
      return true;
    }

    console.log(`Updating "Send mail as" for ${targetEmail} (default:${needsDefault}, name:${needsName ? `"${desiredDisplayName}"` : 'unchanged'})...`);
    await gmail.users.settings.sendAs.update({
      userId: 'me',
      sendAsEmail: targetEmail,
      requestBody: {
        ...targetSendAs,
        isDefault: true,
        displayName: desiredDisplayName || targetSendAs.displayName,
      },
    });

    console.log(` Updated "Send mail as" for ${targetEmail}`);
    // Cache the successful update
    sendAsCache.set(targetEmail, { verified: true, lastChecked: now });
    return true;
  } catch (error) {
    console.warn(` Could not update "Send mail as" settings: ${error.message}`);
    console.warn(` You may need to grant "https://www.googleapis.com/auth/gmail.settings.basic" scope.`);
    sendAsCache.set(targetEmail, { verified: false, lastChecked: now });
    return false;
  }
}

export async function sendEmail(from, to, subject, body, options = {}) {
  const account = getAccountByEmail(from);
  const actualFromEmail = account.email;
  if (from.toLowerCase() !== actualFromEmail.toLowerCase()) {
    console.warn(` Warning: 'from' parameter (${from}) doesn't match account email (${actualFromEmail}). Using account email from config.json.`);
  }
  
  // Retry logic for invalid_grant errors - clear cache and retry
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Clear cache if this is a retry (invalid_grant means token issue)
      if (attempt > 0) {
        oauth2ClientCache.delete(actualFromEmail);
        gmailClientCache.delete(actualFromEmail);
        console.log(`🔄 Retry ${attempt}: Cleared OAuth cache for ${actualFromEmail}`);
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
      
      // Get fresh Gmail client (will create new one if cache was cleared)
      const gmail = getGmailClient(actualFromEmail, account.refreshToken);
      await ensureCorrectSendAsDefault(gmail, actualFromEmail);
      const rawMessage = createEmailMessage(actualFromEmail, to, subject, body, {
        inReplyTo: options.inReplyTo,
        references: options.references,
        displayName: getAccountDisplayName(actualFromEmail),
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawMessage,
          ...(options.threadId ? { threadId: options.threadId } : {}),
        },
      });

      // Fetch internetMessageId for threading (required for follow-ups)
      // This is fast - just one metadata API call
      let internetMessageId = null;
      try {
        const sentMessage = await gmail.users.messages.get({
          userId: 'me',
          id: response.data.id,
          format: 'metadata',
          metadataHeaders: ['Message-Id', 'Message-ID'],
        });
        const headers = Object.fromEntries(
          (sentMessage.data.payload?.headers || []).map(h => [h.name, h.value])
        );
        const msgIdRaw = headers['Message-Id'] || headers['Message-ID'] || '';
        internetMessageId = msgIdRaw && !/^<.*>$/.test(msgIdRaw) ? `<${msgIdRaw}>` : msgIdRaw;
      } catch (e) {
        // If we can't get Message-ID, continue anyway - threading might still work with threadId
        console.warn(`Could not fetch Message-ID for ${response.data.id}: ${e.message}`);
      }

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId,
        internetMessageId,
      };
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || String(error);
      
      // If it's invalid_grant, retry (clear cache and try again)
      if (errorMsg.includes('invalid_grant') && attempt < 2) {
        continue; // Retry
      }
      
      // For other errors or max retries reached, throw
      throw new Error(`Failed to send email: ${errorMsg}`);
    }
  }
  
  // Should never reach here, but just in case
  throw new Error(`Failed to send email after retries: ${lastError?.message || 'Unknown error'}`);
}

export function getConfiguredAccounts() {
  try {
    const config = loadConfig();
    return config.accounts.map(acc => acc.email);
  } catch (error) {
    throw new Error(`Failed to get accounts: ${error.message}`);
  }
}

function normalizeFromHeader(fromHeader) {
  if (!fromHeader) return '';
  const m = fromHeader.match(/<([^>]+)>/);
  const addr = (m ? m[1] : fromHeader).trim();
  return addr.toLowerCase();
}

function stripAngleBrackets(messageId) {
  return String(messageId || '')
    .trim()
    .replace(/^</, '')
    .replace(/>$/, '');
}

function recipientEmailMatches(fromAddr, recipientEmail) {
  if (!recipientEmail || !fromAddr) return false;
  return fromAddr === String(recipientEmail).trim().toLowerCase();
}

/** Exact match — avoids false skips when one address is a substring of another. */
function isOurOutboundSender(fromAddr, accountEmail) {
  if (!fromAddr || !accountEmail) return false;
  return fromAddr === String(accountEmail).trim().toLowerCase();
}

function messageToReplyRecord(message, headers, fromAddr) {
  const dateMs = Date.parse(headers['Date'] || '');
  const parsedDate = Number.isFinite(dateMs) ? new Date(dateMs) : new Date();
  return {
    fromHeader: headers['From'] || '',
    fromEmail: fromAddr,
    subject: headers['Subject'] || '',
    date: parsedDate,
    snippet: message.snippet || '',
    body: message.payload ? extractPlainReplyBody(message.payload) : '',
    gmailMessageId: message.id || '',
  };
}

function isAutomatedBulk(headers) {
  const precedence = (headers['Precedence'] || '').toLowerCase();
  return precedence && (precedence.includes('bulk') || precedence.includes('junk'));
}

/** OOO / vacation — from the real recipient, not list mail */
function isVacationLike(headers) {
  if (isAutomatedBulk(headers)) return false;
  const subject = (headers['Subject'] || '').toLowerCase();
  const auto = (headers['Auto-Submitted'] || '').toLowerCase();
  const precedence = (headers['Precedence'] || '').toLowerCase();
  if (auto === 'auto-replied') return true;
  if (precedence.includes('auto_reply')) return true;
  if (subject.startsWith('auto:')) return true;
  if (subject.includes('out of office') || subject.includes('out of the office')) return true;
  if (subject.includes('automatic reply')) return true;
  return false;
}

function isHumanNonAutomated(headers) {
  const autoSubmitted = (headers['Auto-Submitted'] || '').toLowerCase();
  const precedence = (headers['Precedence'] || '').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return false;
  if (precedence && (precedence.includes('bulk') || precedence.includes('junk') || precedence.includes('auto_reply'))) return false;
  return true;
}

function referencesOurMessage(headers, internetMessageId) {
  if (!internetMessageId) return false;
  const target = stripAngleBrackets(internetMessageId).toLowerCase();
  if (!target) return false;
  const inReplyTo = (headers['In-Reply-To'] || '').toLowerCase();
  const refs = (headers['References'] || '').toLowerCase();
  return inReplyTo.includes(target) || refs.includes(target);
}

function normalizeSubjectForCompare(subject) {
  return String(subject || '')
    .toLowerCase()
    .replace(/^\s*(re|fwd|fw)(\s*\[[^\]]+\])?\s*:\s*/gi, '')
    .trim();
}

/** Strict subject match only — avoids matching one shared campaign subject across many contacts. */
function subjectsMatchExactly(candidateSubject, outboundSubject) {
  const out = normalizeSubjectForCompare(outboundSubject);
  const cand = normalizeSubjectForCompare(candidateSubject);
  if (!out.length || !cand.length) return false;
  return out === cand;
}

function collectOutboundMessageIds(internetMessageId, allInternetMessageIds) {
  const ids = [];
  if (internetMessageId) ids.push(internetMessageId);
  if (Array.isArray(allInternetMessageIds)) {
    for (const id of allInternetMessageIds) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function referencesAnyOutboundMessage(headers, messageIds) {
  for (const id of messageIds) {
    if (referencesOurMessage(headers, id)) return true;
  }
  return false;
}

function correlatesToOutbound(headers, outboundSubject, internetMessageId) {
  if (referencesOurMessage(headers, internetMessageId)) return true;
  if (!outboundSubject) return false;
  return subjectsMatchExactly(headers['Subject'] || '', outboundSubject);
}

const REPLY_METADATA_HEADERS = [
  'From',
  'To',
  'Subject',
  'Date',
  'Auto-Submitted',
  'Precedence',
  'In-Reply-To',
  'References',
];

async function fetchMessageMetadata(gmail, messageId) {
  const meta = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: REPLY_METADATA_HEADERS,
  });
  const headers = Object.fromEntries((meta.data.payload?.headers || []).map((h) => [h.name, h.value]));
  return {
    headers,
    fromAddr: normalizeFromHeader(headers['From'] || ''),
    internalMs: Number(meta.data.internalDate || 0),
  };
}

/**
 * Reply in a separate thread that explicitly references our outbound Message-ID.
 * Safe across contacts (each send has a unique Message-ID).
 */
async function findInboxReplyByMessageReference({
  gmail,
  fromEmail,
  internetMessageId,
  allInternetMessageIds = null,
  lastSent,
}) {
  const messageIds = collectOutboundMessageIds(internetMessageId, allInternetMessageIds);
  if (!messageIds.length) return null;

  const q = `to:${fromEmail} in:inbox`;
  let list;
  try {
    list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 40 });
  } catch {
    return null;
  }

  const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;
  const candidates = [];

  for (const m of list.data.messages || []) {
    const { headers, fromAddr, internalMs } = await fetchMessageMetadata(gmail, m.id);
    if (isOurOutboundSender(fromAddr, fromEmail)) continue;
    if (!isHumanNonAutomated(headers)) continue;
    if (isVacationLike(headers)) continue;
    if (!referencesAnyOutboundMessage(headers, messageIds)) continue;
    if (lastSentMs && internalMs > 0 && internalMs < lastSentMs - 60_000) continue;
    candidates.push({ id: m.id, internalMs, headers, fromAddr });
  }

  candidates.sort((a, b) => b.internalMs - a.internalMs);
  if (!candidates.length) return null;

  const pick = candidates[0];
  const full = await gmail.users.messages.get({ userId: 'me', id: pick.id, format: 'full' });
  const message = full.data;
  const headers = Object.fromEntries((message.payload?.headers || []).map((h) => [h.name, h.value]));
  return messageToReplyRecord(message, headers, pick.fromAddr);
}

/**
 * Fallback when Message-ID is missing: only inbox mail from this recipient to us
 * with the exact same subject line (not shared keywords).
 */
async function findRecipientInboxHumanReply({
  gmail,
  fromEmail,
  recipientEmail,
  outboundSubject,
  lastSent,
}) {
  if (!recipientEmail || !outboundSubject) return null;

  const q = `from:${recipientEmail} to:${fromEmail}`;
  let list;
  try {
    list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 25 });
  } catch {
    return null;
  }

  const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;
  const candidates = [];

  for (const m of list.data.messages || []) {
    const { headers, fromAddr, internalMs } = await fetchMessageMetadata(gmail, m.id);
    if (!recipientEmailMatches(fromAddr, recipientEmail)) continue;
    if (!isHumanNonAutomated(headers)) continue;
    if (isVacationLike(headers)) continue;
    if (!subjectsMatchExactly(headers['Subject'] || '', outboundSubject)) continue;
    if (lastSentMs && internalMs > 0 && internalMs < lastSentMs - 60_000) continue;
    candidates.push({ id: m.id, internalMs, headers, fromAddr });
  }

  candidates.sort((a, b) => b.internalMs - a.internalMs);
  if (!candidates.length) return null;

  const pick = candidates[0];
  const full = await gmail.users.messages.get({ userId: 'me', id: pick.id, format: 'full' });
  const message = full.data;
  const headers = Object.fromEntries((message.payload?.headers || []).map((h) => [h.name, h.value]));
  return messageToReplyRecord(message, headers, pick.fromAddr);
}

/**
 * Some clients send OOO in a separate Gmail thread. Search the inbox for a
 * vacation message from the recipient to us that correlates to this campaign.
 */
async function findLooseRecipientVacationReply({
  gmail,
  fromEmail,
  recipientEmail,
  outboundSubject,
  internetMessageId,
  lastSent,
}) {
  if (!recipientEmail) return null;
  if (!outboundSubject && !internetMessageId) return null;
  const q = `from:${recipientEmail} to:${fromEmail}`;
  let list;
  try {
    list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 25 });
  } catch {
    return null;
  }
  const items = list.data.messages || [];
  const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;
  const candidates = [];
  for (const m of items) {
    const meta = await gmail.users.messages.get({
      userId: 'me',
      id: m.id,
      format: 'metadata',
      metadataHeaders: [
        'From',
        'Subject',
        'Date',
        'Auto-Submitted',
        'Precedence',
        'In-Reply-To',
        'References',
      ],
    });
    const headers = Object.fromEntries((meta.data.payload?.headers || []).map((h) => [h.name, h.value]));
    const fromAddr = normalizeFromHeader(headers['From'] || '');
    if (!recipientEmailMatches(fromAddr, recipientEmail)) continue;
    if (!isVacationLike(headers)) continue;
    if (!correlatesToOutbound(headers, outboundSubject, internetMessageId)) continue;
    const internalMs = Number(meta.data.internalDate || 0);
    if (lastSentMs && internalMs > 0 && internalMs < lastSentMs - 2 * 86400000) continue;
    candidates.push({ id: m.id, internalMs, headers });
  }
  candidates.sort((a, b) => b.internalMs - a.internalMs);
  if (!candidates.length) return null;
  const pick = candidates[0];
  const full = await gmail.users.messages.get({ userId: 'me', id: pick.id, format: 'full' });
  const message = full.data;
  const headers = Object.fromEntries((message.payload?.headers || []).map((h) => [h.name, h.value]));
  const dateMs = Date.parse(headers['Date'] || '');
  const parsedDate = Number.isFinite(dateMs)
    ? new Date(dateMs)
    : new Date(Number(pick.internalMs) || Date.now());
  return {
    fromHeader: headers['From'] || '',
    fromEmail: normalizeFromHeader(headers['From'] || ''),
    subject: headers['Subject'] || '',
    date: parsedDate,
    snippet: message.snippet || '',
    body: message.payload ? extractPlainReplyBody(message.payload) : '',
    gmailMessageId: message.id || '',
  };
}

export async function checkThreadForReply({
  fromEmail,
  threadId,
  recipientEmail,
  outboundSubject = null,
  internetMessageId = null,
  allInternetMessageIds = null,
  lastSent = null,
}) {
  try {
    const account = getAccountByEmail(fromEmail);
    // Use cached Gmail client (permanent optimization)
    const gmail = getGmailClient(account.email, account.refreshToken);

    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['From', 'Auto-Submitted', 'Precedence', 'Subject'],
    });
    const messages = thread.data.messages || [];

    const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;

    for (const message of messages) {
      const headersArr = message.payload?.headers || [];
      const headers = Object.fromEntries(headersArr.map(h => [h.name, h.value]));
      const fromAddr = normalizeFromHeader(headers['From'] || '');
      if (isOurOutboundSender(fromAddr, fromEmail)) continue;
      const internalMs = Number(message.internalDate || 0);
      if (lastSentMs && internalMs > 0 && internalMs < lastSentMs - 60_000) continue;
      // Any human inbound in thread (including replies from a different email than we mailed)
      if (isHumanNonAutomated(headers) && fromAddr) return true;
      // Recipient vacation / OOO in the same thread (often Auto-Submitted: auto-replied or Subject: Auto: ...)
      if (recipientEmail && recipientEmailMatches(fromAddr, recipientEmail) && isVacationLike(headers)) {
        return true;
      }
    }

    const looseVacation = await findLooseRecipientVacationReply({
      gmail,
      fromEmail,
      recipientEmail,
      outboundSubject,
      internetMessageId,
      lastSent,
    });
    if (looseVacation) return true;

    const byMessageRef = await findInboxReplyByMessageReference({
      gmail,
      fromEmail,
      internetMessageId,
      allInternetMessageIds,
      lastSent,
    });
    if (byMessageRef) return true;

    const byRecipient = await findRecipientInboxHumanReply({
      gmail,
      fromEmail,
      recipientEmail,
      outboundSubject,
      lastSent,
    });
    if (byRecipient) return true;

    return false;
  } catch (error) {
    const errorMsg = error.message || String(error);
    // If it's an OAuth2 error, log it clearly
    if (errorMsg.includes('oauth2') || errorMsg.includes('token') || errorMsg.includes('400') || errorMsg.includes('Bad Request') || error?.response?.status === 400) {
      console.error(`❌ OAuth2 token error for account ${fromEmail} when checking thread ${threadId}:`, errorMsg);
      console.error(`   💡 This account may need a new refresh token. Run: npm run generate-token`);
    } else {
      console.error(`Error checking thread ${threadId} for reply from ${fromEmail}:`, errorMsg);
    }
    // CRITICAL: Throw error instead of returning false
    // This allows the caller to handle it properly (reschedule instead of sending)
    // Returning false would cause emails to be sent to recipients who may have replied
    throw error;
  }
}

export async function getLatestHumanReply({
  fromEmail,
  threadId,
  recipientEmail = null,
  outboundSubject = null,
  internetMessageId = null,
  allInternetMessageIds = null,
  lastSent = null,
}) {
  try {
    const account = getAccountByEmail(fromEmail);
    const gmail = getGmailClient(account.email, account.refreshToken);
    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    const messages = thread.data.messages || [];

    const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;

    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      const message = messages[idx];
      const headersArr = message.payload?.headers || [];
      const headers = Object.fromEntries(headersArr.map(h => [h.name, h.value]));
      const fromAddr = normalizeFromHeader(headers['From'] || '');

      if (isOurOutboundSender(fromAddr, fromEmail)) continue;
      const internalMs = Number(message.internalDate || 0);
      if (lastSentMs && internalMs > 0 && internalMs < lastSentMs - 60_000) continue;
      if (!isHumanNonAutomated(headers)) continue;
      if (!fromAddr) continue;

      return messageToReplyRecord(message, headers, fromAddr);
    }

    if (recipientEmail) {
      for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
        const message = messages[idx];
        const headersArr = message.payload?.headers || [];
        const headers = Object.fromEntries(headersArr.map(h => [h.name, h.value]));
        const fromAddr = normalizeFromHeader(headers['From'] || '');
        if (isOurOutboundSender(fromAddr, fromEmail)) continue;
        if (!recipientEmailMatches(fromAddr, recipientEmail)) continue;
        if (!isVacationLike(headers)) continue;
        const internalMs = Number(message.internalDate || 0);
        if (lastSentMs && internalMs > 0 && internalMs < lastSentMs - 60_000) continue;

        return messageToReplyRecord(message, headers, fromAddr);
      }
    }

    const looseVacation = await findLooseRecipientVacationReply({
      gmail,
      fromEmail,
      recipientEmail,
      outboundSubject,
      internetMessageId,
      lastSent,
    });
    if (looseVacation) return looseVacation;

    const byMessageRef = await findInboxReplyByMessageReference({
      gmail,
      fromEmail,
      internetMessageId,
      allInternetMessageIds,
      lastSent,
    });
    if (byMessageRef) return byMessageRef;

    return await findRecipientInboxHumanReply({
      gmail,
      fromEmail,
      recipientEmail,
      outboundSubject,
      lastSent,
    });
  } catch (error) {
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('oauth2') || errorMsg.includes('token') || errorMsg.includes('400') || errorMsg.includes('Bad Request') || error?.response?.status === 400) {
      console.error(`❌ OAuth2 token error for account ${fromEmail} when fetching reply for thread ${threadId}:`, errorMsg);
      console.error(`   💡 This account may need a new refresh token. Run: npm run generate-token`);
    } else {
      console.error(`Error fetching latest reply for thread ${threadId} from ${fromEmail}:`, errorMsg);
    }
    throw error;
  }
}

export async function listNoReplyThreads({ fromEmail, days = 3 }) {
  const account = getAccountByEmail(fromEmail);
  // Use cached Gmail client (permanent optimization)
  const gmail = getGmailClient(account.email, account.refreshToken);
  const q = days <= 0 ? 'in:sent newer_than:1d' : `in:sent older_than:${days}d`;
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const lowerBound = days <= 0 ? new Date(now.getTime() - oneDayMs) : null;
  const upperBound = days > 0 ? new Date(now.getTime() - days * oneDayMs) : null;
  const threadsResp = await gmail.users.threads.list({ userId: 'me', q, maxResults: 50 });
  const threads = threadsResp.data.threads || [];

  const results = [];
  for (const t of threads) {
    const thread = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'metadata', metadataHeaders: ['From','To','Subject','Date','Message-Id','Message-ID'] });
    const messages = thread.data.messages || [];
    if (!messages.length) continue;
    const last = messages[messages.length - 1];
    const headers = Object.fromEntries((last.payload?.headers || []).map(h => [h.name, h.value]));
    const lastFrom = headers['From'] || '';
    const lastTo = headers['To'] || '';
    let recipientName = '';
    const toHeader = lastTo;
    const nameMatch = toHeader.match(/^("?([^"<]+)"?)?\s*<[^>]+>/);
    if (nameMatch && nameMatch[2]) {
      recipientName = String(nameMatch[2]).split(' ')[0];
    } else {
      const emailOnly = (toHeader.split(',')[0] || '').trim();
      const emailMatch = emailOnly.match(/<([^>]+)>/) || emailOnly.match(/([^\s,<>@]+@[^\s,<>@]+)/);
      const local = emailMatch ? emailMatch[1] || emailMatch[0] : '';
      const localPart = (local.split('@')[0] || '').replace(/[^a-zA-Z]/g, ' ');
      recipientName = localPart.split(' ')[0] || '';
    }
    
    if (!recipientName || recipientName.length < 2) {
      try {
        const firstThread = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' });
        const firstMessage = firstThread.data.messages?.[0];
        if (firstMessage?.payload) {
          const firstBody = extractEmailBody(firstMessage.payload);
          const extractedName = extractRecipientNameFromBody(firstBody);
          if (extractedName) {
            recipientName = extractedName;
          }
        }
      } catch (e) {
      }
    }
    const subject = headers['Subject'] || '';
    const dateMs = Date.parse(headers['Date'] || '');
    const lastDate = Number.isFinite(dateMs) ? new Date(dateMs) : new Date(0);
    const withinTodayWindow = days <= 0 ? lastDate >= lowerBound : true;
    const withinOlderThanWindow = days > 0 ? lastDate <= upperBound : true;
    if (lastFrom.toLowerCase().includes(fromEmail.toLowerCase()) && withinTodayWindow && withinOlderThanWindow) {
      const msgIdRaw = headers['Message-Id'] || headers['Message-ID'] || '';
      const internetMessageId = msgIdRaw && !/^<.*>$/.test(msgIdRaw) ? `<${msgIdRaw}>` : msgIdRaw;
      results.push({
        threadId: t.id,
        messageId: last.id,
        internetMessageId,
        from: fromEmail,
        to: lastTo,
        recipientName,
        subject,
        snippet: last.snippet || '',
        lastMessageDate: lastDate,
      });
    }
  }
  return results;
}

export async function getThreadSummary({ fromEmail, threadId }) {
  const account = getAccountByEmail(fromEmail);
  // Use cached Gmail client (permanent optimization)
  const gmail = getGmailClient(account.email, account.refreshToken);
  const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
  const messages = thread.data.messages || [];
  const lines = [];
  let firstEmailBody = '';
  let lastOutgoingBody = '';
  let lastOutgoingToHeader = '';
  
  for (let idx = 0; idx < messages.length; idx += 1) {
    const m = messages[idx];
    const headers = Object.fromEntries((m.payload?.headers || []).map(h => [h.name, h.value]));
    const from = headers['From'] || 'Unknown';
    const date = headers['Date'] || '';
    const snippet = m.snippet || '';
    if (idx === 0 && m.payload) {
      firstEmailBody = extractEmailBody(m.payload);
    }
    if (from.toLowerCase().includes(fromEmail.toLowerCase()) && m.payload) {
      lastOutgoingBody = extractEmailBody(m.payload);
      lastOutgoingToHeader = headers['To'] || lastOutgoingToHeader;
    }
    lines.push(`${date} — ${from}: ${snippet}`);
  }
  return { summary: lines.join('\n'), firstEmailBody, lastOutgoingBody, lastOutgoingToHeader };
}

export function extractRecipientNameFromBody(body) {
  if (!body) return '';
  const patterns = [
    /Dear\s+([A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?)\s+ma[''`]?am/i,
    /Dear\s+([A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?)[,\s]/i,
    /Hi\s+([A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?)[,\s]/i,
    /Hello\s+([A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?)[,\s]/i,
  ];
  
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      return match[1].trim().split(' ')[0];
    }
  }
  return '';
}


function decodeMimePartData(data) {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

function collectPlainTextParts(payload, out = []) {
  if (!payload) return out;
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    out.push(decodeMimePartData(payload.body.data));
  }
  for (const part of payload.parts || []) {
    collectPlainTextParts(part, out);
  }
  return out;
}

function stripQuotedReplyText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (/^On .+ wrote:$/i.test(trimmed)) break;
    if (/^On .+, .+ wrote:$/i.test(trimmed)) break;
    if (/^> On .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+ at .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+, .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+ \d{4}, at .+ wrote:$/i.test(trimmed)) break;
    if (/^> ?On .+ \d{4}, at .+ .+ wrote:$/i.test(trimmed)) break;
    if (/^_{5,}$/.test(trimmed)) break;
    if (/^From:\s.+$/i.test(trimmed) && kept.length > 0) break;
    if (/^Sent:\s.+$/i.test(trimmed) && kept.length > 0) break;
    kept.push(line);
  }
  return kept.join('\n').trimEnd();
}

function extractPlainReplyBody(payload) {
  const plainParts = collectPlainTextParts(payload);
  if (!plainParts.length) {
    return extractEmailBody(payload);
  }
  return stripQuotedReplyText(plainParts[0]);
}

function extractEmailBody(payload) {
  let body = '';
  if (payload.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  } else if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
        if (part.body?.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          if (subPart.mimeType === 'text/plain' || subPart.mimeType === 'text/html') {
            if (subPart.body?.data) {
              body += Buffer.from(subPart.body.data, 'base64').toString('utf-8');
            }
          }
        }
      }
    }
  }
  
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
