#!/bin/bash
# Check script for Codex to run on Render if needed

echo "=== Render Environment Check ==="
echo "Data directory:"
ls -la /opt/render/project/src/data/ 2>/dev/null || echo "Data dir not found"

echo ""
echo "Database file:"
if [ -f /opt/render/project/src/data/celebrity-pen-pal.db ]; then
    echo "Database exists"
    sqlite3 /opt/render/project/src/data/celebrity-pen-pal.db "SELECT COUNT(*) FROM celebrities;" 2>/dev/null || echo "Cannot query celebrities table"
else
    echo "Database NOT FOUND"
fi

echo ""
echo "Environment:"
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
