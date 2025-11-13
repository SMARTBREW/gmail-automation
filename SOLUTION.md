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

### Required OAuth Scopes
Your refresh tokens **MUST** include all 3 of these scopes:
1. `https://www.googleapis.com/auth/gmail.send` - For sending emails
2. `https://www.googleapis.com/auth/gmail.settings.basic` - For managing "Send mail as" settings
3. `https://www.googleapis.com/auth/gmail.metadata` - For reading email headers (Message-ID) for threading

### Your Existing Tokens
Your current refresh tokens likely only have:
```
https://www.googleapis.com/auth/gmail.send
```

You need to regenerate them with **ALL 3** scopes.

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

### Option 2: Google OAuth2 Playground (Step-by-Step)

#### Step 1: Get Your OAuth Credentials
1. Open your `.env` file in the project
2. Find these two values:
   - `GOOGLE_CLIENT_ID` - Copy this value
   - `GOOGLE_CLIENT_SECRET` - Copy this value
3. Keep these values handy - you'll need them in the next step

#### Step 2: Open OAuth Playground
1. Go to: https://developers.google.com/oauthplayground/
2. You'll see a page with "Step 1" and "Step 2" sections

#### Step 3: Configure OAuth Credentials
1. Look for the **⚙️ gear icon** in the **top right corner** of the page
2. Click the gear icon - a configuration modal titled "OAuth 2.0 configuration" will open
3. **First, check the checkbox** that says **"Use your own OAuth credentials"** (at the bottom of the modal)
4. **After checking the box**, two new input fields will appear:
   - **OAuth Client ID**: Paste your `GOOGLE_CLIENT_ID` from `.env` here
   - **OAuth Client secret**: Paste your `GOOGLE_CLIENT_SECRET` from `.env` here
5. In the same modal, verify these settings are correct:
   - **Access type**: Should be set to `Offline` (this is required to get a refresh_token)
   - **Force prompt**: Should be set to `Consent Screen` (this ensures a new refresh_token is issued)
   - If these are not set correctly, change them using the dropdowns
6. Click **"Close"** button at the bottom to close the configuration modal

#### Step 4: Select Scopes
1. In the **"Step 1 - Select & authorize APIs"** section, you'll see a text box
2. Click in the text box and **manually type or paste** these 3 scopes (one per line or space-separated):
   ```
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.settings.basic
   https://www.googleapis.com/auth/gmail.metadata
   ```
   
   **IMPORTANT:** You MUST include all 3 scopes. Missing any scope will cause errors.
   
   - `gmail.send` - for sending emails
   - `gmail.settings.basic` - for managing "Send mail as" settings  
   - `gmail.metadata` - for reading headers (Message-ID) for email threading

#### Step 5: Authorize
1. Click the **"Authorize APIs"** button (blue button)
2. A new window/tab will open asking you to sign in
3. **Sign in with the Gmail account** you want to generate a token for (e.g., `workwithayush2003@gmail.com`)
4. You'll see a permission screen - click **"Allow"** to grant permissions
5. You'll be redirected back to OAuth Playground

#### Step 6: Exchange for Tokens
1. After authorization, you'll see **"Step 2 - Exchange authorization code for tokens"**
2. Click the **"Exchange authorization code for tokens"** button (blue button)
3. You'll see a JSON response with tokens

#### Step 7: Copy the Refresh Token
1. In the response, find the **`refresh_token`** field
2. Copy the entire refresh token value (it will look like: `1//04Lcqj7hD7NyRCgYIARAAGAQSNwF-L9Ir...`)
3. **Important:** Make sure you copy the `refresh_token`, NOT the `access_token`

#### Step 8: Update config.json
1. Open `config.json` in your project
2. Find the account entry for the email you just authorized
3. Replace the `refreshToken` value with the new token you copied
4. Save the file

#### Troubleshooting
- **If you don't see a `refresh_token`**: 
  - Click the gear icon again
  - Make sure "Force prompt: Consent" is checked
  - Re-authorize from Step 5
  
- **If you get "redirect_uri_mismatch" error**:
  - This means your OAuth Client ID doesn't have the correct redirect URI
  - Go to Google Cloud Console → APIs & Services → Credentials
  - Edit your OAuth 2.0 Client ID
  - Add `https://developers.google.com/oauthplayground` to "Authorized redirect URIs"
  - Save and try again

- **If you get "unauthorized_client" error**:
  - Make sure you're using the SAME Client ID and Secret from your `.env` file
  - The refresh token is tied to the OAuth client that generated it

## Next Steps

1. **Generate new refresh tokens** for ALL accounts in `config.json` with all 3 scopes:
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

