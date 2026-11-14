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
AI_JUDGE=off CP_DEMO=0 CONTENT_TTL_MS=400 AI_HOURLY_LIMIT=8 AI_DAILY_LIMIT=1000 SUPABASE_URL=http://localhost:3113 SUPABASE_PUBLISHABLE_KEY=sb_publishable_test SUPABASE_SERVICE_ROLE_KEY=sb_secret_test \
  AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112 PORT=3115 nohup node test/devserver.mjs > /tmp/dev-real-key.log 2>&1 &
# 3116: the same, with a generous hourly limit, so the per-minute burst limit is what stops a rapid-fire caller
CP_DEMO=0 CONTENT_TTL_MS=400 AI_HOURLY_LIMIT=1000 AI_DAILY_LIMIT=1000 SUPABASE_URL=http://localhost:3113 SUPABASE_PUBLISHABLE_KEY=sb_publishable_test SUPABASE_SERVICE_ROLE_KEY=sb_secret_test \
  AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112 PORT=3116 nohup node test/devserver.mjs > /tmp/dev-real-burst.log 2>&1 &
# 3117: the same with AI scoring on (the marker is the fake model), a small hourly allowance so the limit can be reached
CP_DEMO=0 CONTENT_TTL_MS=400 AI_HOURLY_LIMIT=6 AI_DAILY_LIMIT=1000 SUPABASE_URL=http://localhost:3113 SUPABASE_PUBLISHABLE_KEY=sb_publishable_test SUPABASE_SERVICE_ROLE_KEY=sb_secret_test \
  AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112 PORT=3117 nohup node test/devserver.mjs > /tmp/dev-real-judge.log 2>&1 &
# 3118: the same service-key setup with a cron secret set (the keep-alive route must refuse callers without it)
TURNSTILE_SITE_KEY=test-site-key CRON_SECRET=cron-secret-test CP_DEMO=0 SUPABASE_URL=http://localhost:3113 SUPABASE_PUBLISHABLE_KEY=sb_publishable_test SUPABASE_SERVICE_ROLE_KEY=sb_secret_test PORT=3118 nohup node test/devserver.mjs > /tmp/dev-real-cron.log 2>&1 &
sleep 2
echo started
