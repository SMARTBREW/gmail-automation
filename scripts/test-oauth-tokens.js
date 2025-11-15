#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testRefreshToken(email, refreshToken) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    
    // Try to get an access token (this will trigger a refresh if needed)
    const accessToken = await oauth2Client.getAccessToken();
    
    if (accessToken.token) {
      return { valid: true, error: null };
    } else {
      return { valid: false, error: 'No access token returned' };
    }
  } catch (error) {
    return { 
      valid: false, 
      error: error.message || String(error),
      details: error.response?.data || error
    };
  }
}

async function main() {
  console.log('🔍 Testing OAuth2 Refresh Tokens\n');
  console.log('='.repeat(60));
  
  // Load config
  let config;
  try {
    const configPath = join(__dirname, '../config.json');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error('❌ Failed to load config.json:', error.message);
    process.exit(1);
  }
  
  if (!config.accounts || config.accounts.length === 0) {
    console.error('❌ No accounts found in config.json');
    process.exit(1);
  }
  
  console.log(`\nFound ${config.accounts.length} account(s) to test\n`);
  
  const results = [];
  
  for (const account of config.accounts) {
    console.log(`Testing: ${account.email}...`);
    const result = await testRefreshToken(account.email, account.refreshToken);
    results.push({ email: account.email, ...result });
    
    if (result.valid) {
      console.log(`  ✅ Valid token\n`);
    } else {
      console.log(`  ❌ Invalid token: ${result.error}\n`);
      if (result.details) {
        console.log(`  Details:`, JSON.stringify(result.details, null, 2));
        console.log('');
      }
    }
  }
  
  console.log('='.repeat(60));
  console.log('\n📊 Summary:\n');
  
  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);
  
  console.log(`✅ Valid tokens: ${valid.length}`);
  valid.forEach(r => console.log(`   - ${r.email}`));
  
  console.log(`\n❌ Invalid tokens: ${invalid.length}`);
  invalid.forEach(r => {
    console.log(`   - ${r.email}`);
    console.log(`     Error: ${r.error}`);
  });
  
  if (invalid.length > 0) {
    console.log('\n💡 To fix invalid tokens:');
    console.log('   1. Run: npm run generate-token');
    console.log('   2. Follow the prompts for each invalid account');
    console.log('   3. Update config.json with the new refresh tokens');
    console.log('\n   Or use Google OAuth2 Playground:');
    console.log('   https://developers.google.com/oauthplayground/');
    console.log('   (See SOLUTION.md for detailed instructions)');
  }
  
  process.exit(invalid.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});

