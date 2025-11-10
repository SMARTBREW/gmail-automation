#!/usr/bin/env node
/**
 * Helper script to generate refresh tokens with correct Gmail API scopes
 * 
 * This script helps you generate refresh tokens for your Gmail accounts with
 * BOTH required scopes:
 * - https://www.googleapis.com/auth/gmail.send
 * - https://www.googleapis.com/auth/gmail.settings.basic
 */

import dotenv from 'dotenv';
import { google } from 'googleapis';
import readline from 'readline';

dotenv.config();

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
];

// Use urn:ietf:wg:oauth:2.0:oob as redirect URI (for installed/desktop apps)
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

console.log('\n🔐 Gmail Refresh Token Generator\n');
console.log('This script will help you generate a refresh token with the required scopes.');
console.log('\nRequired scopes:');
console.log('  ✓ gmail.send (for sending emails)');
console.log('  ✓ gmail.settings.basic (for managing "Send mail as" settings)\n');

console.log('⚠️  IMPORTANT: Before continuing, make sure your Google Cloud Console has:');
console.log('   1. OAuth 2.0 Client ID (Desktop app type)');
console.log(`   2. Authorized redirect URI: ${REDIRECT_URI}`);
console.log('   3. Go to: https://console.cloud.google.com/apis/credentials\n');

// Generate authorization URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Force consent screen to get refresh token
});

console.log('📋 Step 1: Open this URL in your browser and authorize the app:\n');
console.log(authUrl);
console.log('\n📋 Step 2: Copy the authorization code from the browser.\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('📥 Paste the authorization code here: ', async (code) => {
  try {
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      console.error('\n❌ Error: No refresh token received.');
      console.error('   This usually happens if the account was already authorized.');
      console.error('   Try revoking access at https://myaccount.google.com/permissions');
      console.error('   and run this script again.\n');
      process.exit(1);
    }
    
    console.log('\n✅ Success! Here is your refresh token:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(tokens.refresh_token);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📝 Add this to your config.json:');
    console.log(JSON.stringify({
      email: 'your-email@gmail.com',
      refreshToken: tokens.refresh_token,
      displayName: 'Your Name'
    }, null, 2));
    console.log('\n✅ This token has BOTH required scopes and will work with the system.\n');
    
  } catch (error) {
    console.error('\n❌ Error getting refresh token:', error.message);
    console.error('   Make sure the authorization code is correct and hasn\'t expired.\n');
    process.exit(1);
  }
  
  rl.close();
});

