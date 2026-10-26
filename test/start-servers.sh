#!/usr/bin/env bash
# Starts everything the browser tests talk to. Stop with: pkill -f 'test/(devserver|fakeopenai|fakesupabase)'
cd "$(dirname "$0")/.."
PORT=3112 nohup node test/fakeopenai.mjs > /tmp/fake-ai.log 2>&1 &
FAKE_PORT=3113 nohup node test/fakesupabase.mjs > /tmp/fake-sb.log 2>&1 &
# 3111: browser-only demo (full curriculum with keys), with the fake model
AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112 PORT=3111 nohup node test/devserver.mjs > /tmp/dev-demo.log 2>&1 &
# 3114: real accounts, no service key (the "not switched on" cases)
CP_DEMO=0 SUPABASE_URL=http://localhost:3113 SUPABASE_PUBLISHABLE_KEY=sb_publishable_test PORT=3114 nohup node test/devserver.mjs > /tmp/dev-real.log 2>&1 &
# 3115: real accounts with the service key and the fake model (server grading, challenges, projects)
CP_DEMO=0 SUPABASE_URL=http://localhost:3113 SUPABASE_PUBLISHABLE_KEY=sb_publishable_test SUPABASE_SERVICE_ROLE_KEY=sb_secret_test \
  AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112 PORT=3115 nohup node test/devserver.mjs > /tmp/dev-real-key.log 2>&1 &
sleep 2
echo started
