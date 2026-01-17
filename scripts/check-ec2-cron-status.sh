#!/bin/bash

echo "🔍 Checking EC2 Cron Job Status"
echo "==============================="
echo ""

echo "1️⃣  Check if poll-replies.log exists and show last 50 lines:"
if [ -f "/home/ubuntu/gmail-automation/logs/poll-replies.log" ]; then
    echo "   ✅ Log file exists"
    echo "   Last 50 lines:"
    echo "   ----------------------------------------"
    tail -50 /home/ubuntu/gmail-automation/logs/poll-replies.log | sed 's/^/   /'
    echo "   ----------------------------------------"
else
    echo "   ❌ Log file NOT found: /home/ubuntu/gmail-automation/logs/poll-replies.log"
    echo "   💡 This means the cron job might not be running at all"
fi
echo ""

echo "2️⃣  Check if logs directory exists:"
if [ -d "/home/ubuntu/gmail-automation/logs" ]; then
    echo "   ✅ Logs directory exists"
    ls -la /home/ubuntu/gmail-automation/logs/ | sed 's/^/   /'
else
    echo "   ❌ Logs directory does NOT exist"
    echo "   💡 Create it with: mkdir -p /home/ubuntu/gmail-automation/logs"
fi
echo ""

echo "3️⃣  Check cron service logs for poll-replies:"
echo "   Recent cron entries for poll-replies:"
if [ -f /var/log/cron ]; then
    grep -i "poll-replies" /var/log/cron | tail -10 | sed 's/^/   /'
elif [ -f /var/log/syslog ]; then
    grep -i "poll-replies\|CRON.*poll" /var/log/syslog | tail -10 | sed 's/^/   /'
else
    echo "   ⚠️  Cannot find cron log files"
fi
echo ""

echo "4️⃣  Test running poll-replies manually:"
echo "   Run this command to test:"
echo "   cd /home/ubuntu/gmail-automation && /usr/bin/node bin/poll-replies.js --once"
echo ""

echo "5️⃣  Check if .env file exists and has MONGODB_URI:"
if [ -f "/home/ubuntu/gmail-automation/.env" ]; then
    echo "   ✅ .env file exists"
    if grep -q "MONGODB_URI" /home/ubuntu/gmail-automation/.env; then
        echo "   ✅ MONGODB_URI found in .env"
    else
        echo "   ❌ MONGODB_URI NOT found in .env"
        echo "   💡 Cron jobs don't load .env automatically - you need to set it in crontab"
    fi
else
    echo "   ❌ .env file NOT found"
fi
echo ""

echo "6️⃣  Check current crontab:"
crontab -l | grep -A 2 -B 2 "poll-replies" | sed 's/^/   /'
echo ""

echo "💡 Common Issues:"
echo "   1. Environment variables not loaded (MONGODB_URI missing)"
echo "   2. Script failing due to OAuth errors"
echo "   3. Log file permissions issue"
echo "   4. Node path incorrect"
echo ""
