#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$SCRIPT_DIR/.."
WEB_DIR="$SCRIPT_DIR/../../web/client"

cleanup() {
    if [ -n "$WEB_PID" ]; then
        kill "$WEB_PID" 2>/dev/null || true
    fi
}
trap cleanup INT TERM EXIT

echo "Starting Next.js dev server..."
cd "$WEB_DIR"
bun run dev &
WEB_PID=$!

echo "Waiting for http://localhost:3000..."
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 1
done

# Pre-compile the routes Electron will hit so the window renders immediately.
# /sign-in is the entry point; /w/warmup/projects triggers compilation of the
# dynamic workspace+projects route even without a real workspace slug.
echo "Warming up routes (this takes ~20s on cold start)..."
curl -s "http://localhost:3000/sign-in?native=1" > /dev/null 2>&1 || true
curl -s "http://localhost:3000/w/warmup/projects" > /dev/null 2>&1 || true

echo "Opening desktop app..."
cd "$DESKTOP_DIR"
NEXT_PUBLIC_SITE_URL=http://localhost:3000 electron .
