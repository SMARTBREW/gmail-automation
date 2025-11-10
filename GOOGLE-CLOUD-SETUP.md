# Google Cloud Console Setup Guide

## Fix "redirect_uri_mismatch" Error

The error you're seeing means your Google Cloud OAuth2 credentials don't have the correct redirect URI configured.

## Steps to Fix:

### 1. Go to Google Cloud Console
Open: https://console.cloud.google.com/apis/credentials

### 2. Find Your OAuth 2.0 Client ID
- Look for the OAuth 2.0 Client ID you're using (the one with the Client ID in your `.env` file)
- Click on it to edit

### 3. Add the Redirect URI
Under "Authorized redirect URIs", click **"+ ADD URI"** and add:
```
urn:ietf:wg:oauth:2.0:oob
```

This is the special redirect URI for installed/desktop applications.

### 4. Save
Click **"SAVE"** at the bottom of the page.

### 5. Try Again
Now run the token generator again:
```bash
npm run generate-token
```

## Alternative: Use Google OAuth2 Playground

If you prefer not to modify your OAuth client, you can use Google's OAuth2 Playground instead:

### 1. Go to OAuth2 Playground
Open: https://developers.google.com/oauthplayground/

### 2. Configure Settings
- Click the **⚙️ (gear icon)** in the top right
- Check **"Use your own OAuth credentials"**
- Enter your `GOOGLE_CLIENT_ID` from `.env`
- Enter your `GOOGLE_CLIENT_SECRET` from `.env`
- Close the configuration panel

### 3. Select Scopes
In "Step 1 - Select & authorize APIs", manually enter these scopes:
```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.settings.basic
```

### 4. Authorize
- Click **"Authorize APIs"**
- Sign in with your Gmail account
- Click **"Allow"** to grant permissions

### 5. Get Refresh Token
- Click **"Exchange authorization code for tokens"**
- Copy the **`refresh_token`** value
- Add it to your `config.json`

## Verify Your Setup

After getting new tokens, test with:
```bash
npm run test-campaign
```

You should see:
```
✅ iamayushanand365@gmail.com is already the default "Send mail as" address
📧 Sending email from iamayushanand365@gmail.com using refresh token from config.json
✅ Verified: Email sent from iamayushanand365@gmail.com (matches config.json)
```

## Common Issues

### "Application Type" is Wrong
Your OAuth client must be **"Desktop app"** type, not "Web application". 

To check:
1. Go to https://console.cloud.google.com/apis/credentials
2. Click on your OAuth 2.0 Client ID
3. Look at "Application type" - it should say "Desktop"
4. If it says "Web application", create a new one with type "Desktop"

### Still Getting Errors?
Make sure:
- ✅ Your `.env` has the correct `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- ✅ Your OAuth client is "Desktop app" type
- ✅ You added `urn:ietf:wg:oauth:2.0:oob` as a redirect URI
- ✅ You clicked "SAVE" in Google Cloud Console
- ✅ Wait 1-2 minutes for changes to propagate

