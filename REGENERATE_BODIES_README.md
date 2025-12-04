# Auto-Regenerate Missing Email Bodies

## Problem
Email bodies can sometimes be missing from the Outbox, causing emails to fail when the worker tries to send them. This can happen due to:
- Database cleanup operations
- Edge cases in body deletion
- Retries after failures

## Solution
We've implemented a comprehensive solution:

### 1. **Improved Body Retention Policy**
- **Pending/Sending emails**: Bodies are NEVER deleted (kept indefinitely)
- **Sent/Failed emails**: Bodies are kept for 7 days (increased from 12 hours)
- This prevents most regeneration issues

### 2. **Improved Worker Regeneration Logic**
- The worker now automatically regenerates missing bodies when processing emails
- Improved error handling and campaign lookup
- Better recipient name cleanup

### 3. **Cron Job Script**
A dedicated script (`bin/regenerate-missing-bodies.js`) runs periodically to proactively regenerate any missing bodies.

## Setting Up the Cron Job on EC2

### Step 1: Make the script executable
```bash
chmod +x bin/regenerate-missing-bodies.js
```

### Step 2: Test the script manually
```bash
cd ~/gmail-automation
node bin/regenerate-missing-bodies.js
```

### Step 3: Add to crontab
```bash
crontab -e
```

Add this line to run every 15 minutes:
```cron
*/15 * * * * cd /home/ubuntu/gmail-automation && /usr/bin/node bin/regenerate-missing-bodies.js >> /var/log/regenerate-bodies.log 2>&1
```

Or every 30 minutes:
```cron
*/30 * * * * cd /home/ubuntu/gmail-automation && /usr/bin/node bin/regenerate-missing-bodies.js >> /var/log/regenerate-bodies.log 2>&1
```

### Step 4: Verify cron job is running
```bash
# Check cron logs
tail -f /var/log/regenerate-bodies.log

# Or check syslog
grep CRON /var/log/syslog | tail -20
```

## What the Script Does

1. Finds all pending/sending emails with missing bodies
2. Looks up campaign information (name, recipient, touchpoint)
3. Regenerates the email body using campaign templates
4. Saves the body back to the database
5. Clears any errors

## Monitoring

Check the script output:
```bash
tail -f /var/log/regenerate-bodies.log
```

Or check how many emails have missing bodies:
```bash
node scripts/diagnose-outbox.js
```

## Manual Regeneration

If you need to manually regenerate bodies:
```bash
node bin/regenerate-missing-bodies.js
```

## Notes

- The script is idempotent - safe to run multiple times
- It only processes pending/sending emails
- Failed emails are skipped (they should be handled separately)
- The script logs errors but continues processing

