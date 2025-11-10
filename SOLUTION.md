# Permanent Solution for "Send Mail As" Issue

## Problem
Gmail was sending emails from `ayush@smartbrew.in` instead of the account emails specified in `config.json` (`iamayushanand365@gmail.com`, `h3yayush@gmail.com`).

This happened because Gmail's "Send mail as" feature allows users to have multiple email aliases, and Gmail was using the default alias instead of the authenticated account's primary address.

## Permanent Solution Implemented

### What We Did
The system now **automatically manages Gmail's "Send mail as" settings via the Gmail API** before sending each email.

### How It Works
1. Before sending an email, the code checks which "Send mail as" address is currently set as default
2. If the default doesn't match the email in `config.json`, it automatically updates Gmail settings to set the correct address as default
3. Then it sends the email from the correct address
4. This happens automatically for every email sent, for every account in `config.json`

### Code Changes
Added `ensureCorrectSendAsDefault()` function in `src/services/gmailService.js` that:
- Lists all "Send mail as" addresses for the account
- Checks if the target email (from `config.json`) is the default
- If not, programmatically sets it as the default using Gmail API
- Runs automatically before every email is sent

### Benefits
✅ **Scalable**: Works for unlimited Gmail accounts  
✅ **Automatic**: No manual Gmail settings configuration needed  
✅ **Future-proof**: Works for any new accounts you add to `config.json`  
✅ **Persistent**: Once set, the default stays until you send from a different account  
✅ **No patchwork**: Solves the root cause, not a workaround

## Requirements

### New OAuth Scope Required
Your refresh tokens **MUST** include this additional scope:
```
https://www.googleapis.com/auth/gmail.settings.basic
```

This scope allows the code to programmatically manage "Send mail as" settings.

### Your Existing Tokens
Your current refresh tokens likely only have:
```
https://www.googleapis.com/auth/gmail.send
```

You need to regenerate them with **BOTH** scopes.

## How to Update Your Tokens

### Option 1: Use the Helper Script (Easiest)
```bash
npm run generate-token
```

This will:
1. Show you an authorization URL
2. Ask you to paste the authorization code
3. Generate a refresh token with BOTH required scopes
4. Display the formatted JSON to add to `config.json`

### Option 2: Google OAuth2 Playground
1. Go to https://developers.google.com/oauthplayground/
2. Click ⚙️ (OAuth 2.0 Configuration) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
5. In the same config modal set:
   - Access type: `Offline` (required to get a refresh_token)
   - Force prompt: `Consent` (ensures a new refresh_token is issued)
6. Close the modal. In Step 1 (Select & authorize APIs), add ALL scopes you used:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.settings.basic`
   - `https://www.googleapis.com/auth/gmail.metadata`  ← needed to read headers (Message-ID) for threading
7. Click "Authorize APIs" and sign in to the Gmail account
8. Click "Exchange authorization code for tokens"
9. Copy the `refresh_token` to `config.json` for that account
10. If you don’t see a `refresh_token`, click the gear again, set Force prompt: Consent, then re-authorize

## Next Steps

1. **Generate new refresh tokens** for ALL accounts in `config.json` with both scopes:
   ```bash
   npm run generate-token
   ```

2. **Update `config.json`** with the new refresh tokens

3. **Test the solution**:
   ```bash
   npm run test-campaign
   ```

4. You should see output like:
   ```
   ✅ iamayushanand365@gmail.com is already the default "Send mail as" address
   📧 Sending email from iamayushanand365@gmail.com using refresh token from config.json
   ✅ Verified: Email sent from iamayushanand365@gmail.com (matches config.json)
   ```

## What If I Don't Update the Tokens?

If you don't regenerate the tokens with the new scope, the system will:
- ⚠️ Show a warning: "Could not update 'Send mail as' settings: Insufficient Permission"
- ⚠️ Still send emails, but they may be sent from the default alias
- ❌ Show an error: "Email sent from ayush@smartbrew.in instead of..."

The emails will still be sent, but from the wrong address. **You must update the tokens for the permanent solution to work.**

## For Future Accounts

When adding new Gmail accounts to `config.json`:
1. Run `npm run generate-token` for each account
2. Make sure you authorize with BOTH scopes
3. Add the account to `config.json`
4. The system will automatically handle "Send mail as" settings

No manual Gmail configuration needed!

