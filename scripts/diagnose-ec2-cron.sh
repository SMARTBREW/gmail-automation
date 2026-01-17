#!/bin/bash

echo "🔍 EC2 Cron Job Diagnostics"
echo "============================"
echo ""

echo "1️⃣  Check if cron service is running:"
if systemctl is-active --quiet cron || systemctl is-active --quiet crond; then
    echo "   ✅ Cron service is running"
else
    echo "   ❌ Cron service is NOT running"
    echo "   💡 Start it with: sudo systemctl start cron (or crond)"
fi
echo ""

echo "2️⃣  Check user crontab:"
echo "   Command: crontab -l"
crontab -l 2>/dev/null || echo "   ⚠️  No crontab found for current user"
echo ""

echo "3️⃣  Check for poll-replies cron job:"
crontab -l 2>/dev/null | grep -i "poll-replies" || echo "   ❌ No poll-replies job found in crontab"
echo ""

echo "4️⃣  Check cron logs (last 20 lines):"
if [ -f /var/log/cron ]; then
    echo "   Last 20 lines from /var/log/cron:"
    tail -20 /var/log/cron | grep -i "poll-replies\|CRON" | tail -10 | sed 's/^/   /'
elif [ -f /var/log/syslog ]; then
    echo "   Last 20 lines from /var/log/syslog (cron entries):"
    grep CRON /var/log/syslog | tail -20 | sed 's/^/   /'
else
    echo "   ⚠️  Cannot find cron log files"
fi
echo ""

echo "5️⃣  Check if poll-replies.js exists:"
if [ -f "/home/$(whoami)/gmail-automation/bin/poll-replies.js" ]; then
    echo "   ✅ Found: /home/$(whoami)/gmail-automation/bin/poll-replies.js"
elif [ -f "$(pwd)/bin/poll-replies.js" ]; then
    echo "   ✅ Found: $(pwd)/bin/poll-replies.js"
else
    echo "   ❌ poll-replies.js not found"
    echo "   💡 Expected location: bin/poll-replies.js"
fi
echo ""

echo "6️⃣  Test running poll-replies manually:"
echo "   Command: cd /path/to/gmail-automation && node bin/poll-replies.js --once"
echo "   (Run this manually to test if the script works)"
echo ""

echo "📝 To fix the cron job:"
echo "   1. Edit crontab: crontab -e"
echo "   2. Add this line (runs every 15 minutes):"
echo "      */15 * * * * cd /path/to/gmail-automation && /usr/bin/node bin/poll-replies.js --once >> /path/to/logs/poll-replies.log 2>&1"
echo ""
echo "   Or every 30 minutes:"
echo "      */30 * * * * cd /path/to/gmail-automation && /usr/bin/node bin/poll-replies.js --once >> /path/to/logs/poll-replies.log 2>&1"
echo ""
echo "   Important:"
echo "   - Use full path to node: /usr/bin/node (or find it with: which node)"
echo "   - Use full path to project directory"
echo "   - Redirect output to a log file to see errors"
echo ""
