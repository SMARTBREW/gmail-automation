# Gmail Automation API

node bin/load-initial-batch.js batches/contacts.json
# Weekly (Sunday) - Safety check
node scripts/mark-replied-campaigns.js

# Only when you delete campaigns
node scripts/cleanup-orphaned-followups.js --cancel

A Node.js + Express backend for sending emails via Gmail API using saved refresh tokens.

## Features

- Send emails via Gmail API using OAuth2 refresh tokens
- Support for multiple accounts configured in `config.json`
- Clean modular architecture with ES modules
- RESTful API endpoints

## Prerequisites

- Node.js 18+ (for ES modules support)
- Google Cloud Project with Gmail API enabled
- OAuth 2.0 Client ID credentials (Desktop application type)
- Refresh tokens for each account you want to use

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Google OAuth2 credentials:
   - `GOOGLE_CLIENT_ID`: Your Google OAuth2 Client ID
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth2 Client Secret
   - `PORT`: Server port (default: 3000)

3. **Configure accounts:**
   ```bash
   cp config.json.example config.json
   ```
   
   Edit `config.json` and add your accounts with their refresh tokens:
   ```json
   {
     "accounts": [
       {
         "email": "your-email@gmail.com",
         "refreshToken": "your_refresh_token_here"
       }
     ]
   }
   ```

## Getting Refresh Tokens

To get a refresh token for an account:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Gmail API
4. Create OAuth 2.0 Client ID credentials (Desktop application)
5. Use a tool like [Google OAuth2 Playground](https://developers.google.com/oauthplayground/) or write a script to:
   - Authorize with **BOTH** of these Gmail API scopes:
     - `https://www.googleapis.com/auth/gmail.send` (for sending emails)
     - `https://www.googleapis.com/auth/gmail.settings.basic` (for managing "Send mail as" settings)
   - Exchange the authorization code for a refresh token
   - Save the refresh token in `config.json`

### Required OAuth Scopes

This system requires two Gmail API scopes:

1. **`https://www.googleapis.com/auth/gmail.send`** - For sending emails
2. **`https://www.googleapis.com/auth/gmail.settings.basic`** - For automatically managing "Send mail as" settings

The second scope is required for the **permanent solution** that automatically configures the correct "Send mail as" address for each account in `config.json`. This eliminates the need to manually adjust Gmail settings for each account.

**Important:** When generating refresh tokens, you MUST authorize with BOTH scopes. If your existing refresh tokens only have the `gmail.send` scope, you'll need to regenerate them with both scopes.

### Quick Token Generation (Recommended)

Use the included helper script to generate refresh tokens with the correct scopes:

```bash
npm run generate-token
```

This will:
1. Open an authorization URL in your browser
2. Ask you to paste the authorization code
3. Generate a refresh token with BOTH required scopes
4. Show you the formatted JSON to add to `config.json`

This is the easiest way to ensure all your accounts have the correct permissions.

## Running

**Development mode (with nodemon):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## API Endpoints

### POST `/api/gmail/send`

Send an email via Gmail API.

**Request Body:**
```json
{
  "from": "sender@gmail.com",
  "to": "recipient@example.com",
  "subject": "Test Email",
  "body": "<h1>Hello!</h1><p>This is a test email.</p>"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "1234567890",
    "threadId": "0987654321"
  }
}
```

### POST `/api/gmail/start-campaign`

Start a new 7-touchpoint campaign sequence. Sends the first email and stores it in `campaigns.json`.

**Request Body:**
```json
{
  "from": "sender@gmail.com",
  "to": "recipient@example.com",
  "subject": "Campaign Email",
  "body": "<p>Initial campaign message</p>"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "campaign": {
      "id": "camp_1234567890_abc123",
      "from": "sender@gmail.com",
      "to": "recipient@example.com",
      "subject": "Campaign Email",
      "touchpoint": 1,
      "lastSent": "2025-01-15T10:00:00.000Z",
      "replied": false,
      "threadId": "1234567890",
      "messageId": "0987654321"
    },
    "emailResult": {
      "messageId": "0987654321",
      "threadId": "1234567890"
    }
  }
}
```

### POST `/api/gmail/run-followups`

Run follow-up sequence. Supports both original behavior and 7-touchpoint campaigns.

**Request Body (7-touchpoint mode):**
```json
{
  "campaignMode": true
}
```

**Request Body (original mode):**
```json
{
  "days": 3,
  "force": false
}
```

**Response (campaign mode):**
```json
{
  "success": true,
  "data": {
    "processed": 5,
    "results": [
      {
        "campaignId": "camp_1234567890_abc123",
        "to": "recipient@example.com",
        "touchpoint": 2,
        "status": "sent"
      }
    ]
  }
}
```

### POST `/api/gmail/check-replies`

Check all unreplied campaigns for replies and mark them as replied.

**Request Body:** (none required)

**Response:**
```json
{
  "success": true,
  "data": {
    "checked": 10,
    "repliesFound": 2,
    "results": [
      {
        "campaignId": "camp_1234567890_abc123",
        "to": "recipient@example.com",
        "replied": true
      }
    ]
  }
}
```

### GET `/api/gmail/campaigns`

Get all campaigns from `campaigns.json`.

**Response:**
```json
{
  "success": true,
  "data": {
    "campaigns": [
      {
        "id": "camp_1234567890_abc123",
        "from": "sender@gmail.com",
        "to": "recipient@example.com",
        "subject": "Campaign Email",
        "touchpoint": 3,
        "lastSent": "2025-01-15T10:00:00.000Z",
        "replied": false,
        "threadId": "1234567890",
        "messageId": "0987654321"
      }
    ]
  }
}
```

### GET `/api/gmail/accounts`

Get list of configured account emails.

**Response:**
```json
{
  "success": true,
  "data": ["account1@gmail.com", "account2@gmail.com"]
}
```

### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "Gmail Automation API is running"
}
```

## 7-Touchpoint Campaign System

The system supports automated 7-touchpoint outreach sequences:

1. **Start Campaign**: Use `POST /api/gmail/start-campaign` to send the first email and create a campaign record
2. **Follow-ups**: Use `POST /api/gmail/run-followups` with `{"campaignMode": true}` to send next touchpoint (waits 1-2 days between touchpoints)
3. **Check Replies**: Use `POST /api/gmail/check-replies` to detect replies and mark campaigns as replied
4. **Account Rotation**: Automatically rotates between accounts in `config.json` for sending

**Campaign Flow:**
- Touchpoint 1: Initial email (sent via `/start-campaign`)
- Touchpoints 2-7: Follow-up emails (sent via `/run-followups` with `campaignMode: true`)
- Each follow-up waits 1-2 days since last sent
- Campaigns stop at touchpoint 7 or when replied
- All campaigns stored in `campaigns.json`

## Project Structure

```
gmail-automation/
├── src/
│   ├── routes/
│   │   └── gmailRoutes.js      # API routes (including campaign endpoints)
│   ├── services/
│   │   ├── gmailService.js     # Gmail API service
│   │   ├── campaignService.js  # Campaign management (campaigns.json)
│   │   ├── followupTemplates.js # 7-touchpoint email templates
│   │   └── openAIService.js   # AI follow-up generation
│   ├── jobs/
│   │   └── followUpJob.js      # Automated follow-up job
│   ├── models/
│   │   └── Message.js          # MongoDB message model
│   └── server.js                # Express server
├── config.json                  # Accounts and refresh tokens (not in git)
├── campaigns.json               # Campaign tracking (not in git)
├── .env                         # Environment variables (not in git)
├── nodemon.json                 # Nodemon configuration
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (missing/invalid fields)
- `404`: Route not found
- `500`: Internal server error

All errors include a `success: false` flag and an `error` message.

## Security Notes

- Never commit `.env` or `config.json` to version control
- Keep your refresh tokens secure
- Use environment variables for sensitive data
- Consider using a secrets manager in production

