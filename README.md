# JobAgent

AI-powered job scout. Scrapes 21 boards, filters with Claude Sonnet, delivers via Twilio SMS every Monday.

## Setup

### 1. Clone and install
```bash
git clone <your-repo>
cd jobagent
npm install
npx playwright install chromium   # for Playwright scrapers (Phase 3+)
```

### 2. Environment variables
```bash
cp .env.example .env
# Fill in your keys in .env
```

### 3. Supabase schema
- Open your Supabase project → SQL Editor
- Paste and run `supabase/migrations/001_initial_schema.sql`
- Update the seed row: replace `+614XXXXXXXXX` with your actual mobile number

### 4. Run locally
```bash
npm run dev
```

### 5. Verify everything is connected
```bash
curl http://localhost:3000/health
```
Should return `{ "status": "ok", ... }`

### 6. Test the SMS pipeline (dry run — no SMS sent)
```bash
curl -X POST "http://localhost:3000/digest/run?dry=true"
```

### 7. Send a real test SMS to your number
```bash
curl -X POST http://localhost:3000/sms/test
```

### 8. Trigger a real digest manually
```bash
curl -X POST http://localhost:3000/digest/run
```

## Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Add env vars in Railway dashboard or via CLI:
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set TWILIO_ACCOUNT_SID=AC...
# ... etc
```

## SMS Commands

| Command       | What it does                      |
|---------------|-----------------------------------|
| `APPLY [n]`   | Get direct link for job #n        |
| `APPLIED [n]` | Log that you applied to job #n    |
| `SKIP [n]`    | Dismiss job #n                    |
| `GOOD [n]`    | Mark job #n as strong match       |
| `LIST`        | See all roles from this week      |
| `STATUS`      | Your application pipeline         |
| `PREFS`       | Your current filter settings      |
| `ADD [x]`     | Add industry/location/type        |
| `REMOVE [x]`  | Remove industry/location/type     |
| `PAUSE`       | Stop all alerts                   |
| `RESUME`      | Restart alerts                    |
| `HELP`        | All commands                      |

## Twilio inbound webhook

In your Twilio console → Phone Numbers → your number → Messaging:
- Set webhook URL to: `https://your-railway-url.up.railway.app/sms/inbound`
- Method: HTTP POST

## Build phases

- **Phase 1 (done):** Foundation — Express, Supabase, normaliser, SMS formatter
- **Phase 2:** JobSpy MCP + YC scraper + Claude filter + Twilio SMS + cron
- **Phase 3:** AU scrapers — Seek, GradConnection, Prosple, VC boards, startup boards
- **Phase 4:** Smart features — inbound commands, deadline engine, application tracker
- **Phase 5:** Polish — cover letters, GCal sync, learning loop
