#!/bin/bash

echo "🔍 Finding All Cron Jobs"
echo "========================="
echo ""

echo "1️⃣  Your User Crontab (where your follow-up job is):"
echo "   Command: crontab -l"
echo "   File location: /var/spool/cron/crontabs/\$(whoami)"
echo ""
crontab -l 2>/dev/null || echo "   No user crontab found"
echo ""

echo "2️⃣  System-Wide Crontab:"
echo "   File: /etc/crontab"
if [ -f /etc/crontab ]; then
    echo "   Contents:"
    cat /etc/crontab | grep -v "^#" | grep -v "^$" | sed 's/^/   /'
else
    echo "   File does not exist"
fi
echo ""

echo "3️⃣  System Cron.d Directory:"
echo "   Directory: /etc/cron.d/"
if [ -d /etc/cron.d ]; then
    echo "   Files:"
    ls -la /etc/cron.d/ 2>/dev/null | sed 's/^/   /'
    echo ""
    echo "   Contents of files:"
    for file in /etc/cron.d/*; do
        if [ -f "$file" ]; then
            echo "   --- $file ---"
            cat "$file" | grep -v "^#" | grep -v "^$" | sed 's/^/   /'
            echo ""
        fi
    done
else
    echo "   Directory does not exist"
fi
echo ""

echo "4️⃣  Cron Log File (if it exists):"
if [ -f logs/followups.log ]; then
    echo "   ✅ Found: logs/followups.log"
    echo "   Last 10 lines:"
    tail -10 logs/followups.log | sed 's/^/   /'
else
    echo "   ❌ logs/followups.log not found"
fi
echo ""

echo "5️⃣  PM2 Processes:"
pm2 list 2>/dev/null || echo "   PM2 not available"
echo ""

echo "6️⃣  Cron Service Status:"
systemctl status cron 2>/dev/null | head -5 | sed 's/^/   /' || echo "   Cannot check cron service"
echo ""

echo "📝 To Edit Your Cron Job:"
echo "   crontab -e"
echo ""
echo "📝 To View Cron Logs:"
echo "   tail -f logs/followups.log"
echo "   or"
echo "   grep CRON /var/log/syslog | tail -20"

