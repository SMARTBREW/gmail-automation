import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadConfig() {
  const configPath = join(__dirname, '../../config.json');
  try {
    const configData = readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(`Failed to load config.json: ${error.message}`);
  }
}

function getOAuth2Client(email, refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });
  return oauth2Client;
}

function getAccountByEmail(email) {
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

function createEmailMessage(from, to, subject, body, { inReplyTo, references } = {}) {
  const message = [
    `From: ${from}`,
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

async function ensureCorrectSendAsDefault(gmail, targetEmail) {
  try {
    const sendAsResponse = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const sendAsAddresses = sendAsResponse.data.sendAs || [];
    const targetSendAs = sendAsAddresses.find(
      sa => sa.sendAsEmail?.toLowerCase() === targetEmail.toLowerCase()
    );
    if (!targetSendAs) {
      console.warn(`  Warning: ${targetEmail} not found in "Send mail as" settings. Email may be sent from default alias.`);
      return false;
    }
    if (targetSendAs.isDefault) {
      console.log(` ${targetEmail} is already the default "Send mail as" address`);
      return true;
    }
    
    console.log(`Setting ${targetEmail} as default "Send mail as" address...`);
    await gmail.users.settings.sendAs.update({
      userId: 'me',
      sendAsEmail: targetEmail,
      requestBody: {
        ...targetSendAs,
        isDefault: true,
      },
    });
    
    console.log(` Successfully set ${targetEmail} as default`);
    return true;
  } catch (error) {
    console.warn(` Could not update "Send mail as" settings: ${error.message}`);
    console.warn(` You may need to grant "https://www.googleapis.com/auth/gmail.settings.basic" scope.`);
    return false;
  }
}

export async function sendEmail(from, to, subject, body, options = {}) {
  try {
    const account = getAccountByEmail(from);
    const actualFromEmail = account.email;
    if (from.toLowerCase() !== actualFromEmail.toLowerCase()) {
      console.warn(` Warning: 'from' parameter (${from}) doesn't match account email (${actualFromEmail}). Using account email from config.json.`);
    }
    const oauth2Client = getOAuth2Client(actualFromEmail, account.refreshToken);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    await ensureCorrectSendAsDefault(gmail, actualFromEmail);
    const rawMessage = createEmailMessage(actualFromEmail, to, subject, body, {
      inReplyTo: options.inReplyTo,
      references: options.references,
    });

    console.log(`Sending email from ${actualFromEmail} using refresh token from config.json`);
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
        ...(options.threadId ? { threadId: options.threadId } : {}),
      },
    });

    let internetMessageId = null;
    let actualFromUsed = null;
    try {
      const sentMessage = await gmail.users.messages.get({
        userId: 'me',
        id: response.data.id,
        format: 'metadata',
        metadataHeaders: ['Message-Id', 'Message-ID', 'From'],
      });
      const headers = Object.fromEntries(
        (sentMessage.data.payload?.headers || []).map(h => [h.name, h.value])
      );
      const msgIdRaw = headers['Message-Id'] || headers['Message-ID'] || '';
      internetMessageId = msgIdRaw && !/^<.*>$/.test(msgIdRaw) ? `<${msgIdRaw}>` : msgIdRaw;
      actualFromUsed = headers['From'] || '';
      const fromEmailMatch = actualFromUsed.match(/<([^>]+)>/) || actualFromUsed.match(/([^\s<>@]+@[^\s<>@]+)/);
      const fromEmailUsed = fromEmailMatch ? fromEmailMatch[1] || fromEmailMatch[0] : '';
      
      if (fromEmailUsed.toLowerCase() !== actualFromEmail.toLowerCase()) {
        console.error(`ERROR: Email sent from ${fromEmailUsed} instead of ${actualFromEmail} from config.json!`);
        console.error(`This means Gmail is using a "Send mail as" alias. Please set ${actualFromEmail} as primary in Gmail Settings.`);
      } else {
        console.log(`Verified: Email sent from ${fromEmailUsed} (matches config.json)`);
      }
    } catch (e) {
      console.warn('Could not fetch sent message details:', e.message);
    }

    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
      internetMessageId,
    };
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

export function getConfiguredAccounts() {
  try {
    const config = loadConfig();
    return config.accounts.map(acc => acc.email);
  } catch (error) {
    throw new Error(`Failed to get accounts: ${error.message}`);
  }
}

export async function checkThreadForReply({ fromEmail, threadId, recipientEmail }) {
  try {
    const account = getAccountByEmail(fromEmail);
    const oauth2Client = getOAuth2Client(account.email, account.refreshToken);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['From','Auto-Submitted','Precedence'] });
    const messages = thread.data.messages || [];

    const normalizeEmail = (fromHeader) => {
      if (!fromHeader) return '';
      const m = fromHeader.match(/<([^>]+)>/);
      const addr = (m ? m[1] : fromHeader).trim();
      return addr.toLowerCase();
    };

    const ourFrom = (fromEmail || '').toLowerCase();
    const expectedReplyFrom = (recipientEmail || '').toLowerCase();

    for (const message of messages) {
      const headersArr = message.payload?.headers || [];
      const headers = Object.fromEntries(headersArr.map(h => [h.name, h.value]));
      const fromHeader = headers['From'] || '';
      const autoSubmitted = (headers['Auto-Submitted'] || '').toLowerCase();
      const precedence = (headers['Precedence'] || '').toLowerCase();
      const fromAddr = normalizeEmail(fromHeader);
      if (fromAddr.includes(ourFrom)) continue;
      if (autoSubmitted && autoSubmitted !== 'no') continue;
      if (precedence && (precedence.includes('bulk') || precedence.includes('junk') || precedence.includes('auto_reply'))) continue;
      if (expectedReplyFrom) {
        if (fromAddr === expectedReplyFrom) return true;
        continue;
      }
      if (fromAddr && !fromAddr.includes(ourFrom)) return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking thread for reply:', error);
    return false;
  }
}

export async function listNoReplyThreads({ fromEmail, days = 3 }) {
  const account = getAccountByEmail(fromEmail);
  const oauth2Client = getOAuth2Client(account.email, account.refreshToken);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
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
  const oauth2Client = getOAuth2Client(account.email, account.refreshToken);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
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
