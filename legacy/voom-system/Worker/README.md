# Smart Scalping Cloud AI — veto-only

This is a separate Cloudflare Worker. It does not replace the local MT5 Python bridge, load the .pkl model, or place trades. It returns only APPROVE or HOLD for an already-computed local signal. Local risk checks and EA remain authoritative.

## Deploy
1. Open PowerShell in this folder and run: npx wrangler login
2. Set a long random API secret: npx wrangler secret put API_KEY
3. Deploy: npx wrangler deploy
4. Test GET https://<worker-subdomain>/health and POST /evaluate with X-API-Key.

Workers AI usage may incur charges; check current account pricing and limits before enabling.

## Safe integration
Keep CLOUD_AI_ENABLED=false until deployed and tested in demo/paper mode. Suggested local .env values:
CLOUD_AI_ENABLED=false
CLOUD_AI_URL=https://<worker-subdomain>/evaluate
CLOUD_AI_API_KEY=<same secret>
CLOUD_AI_TIMEOUT_SECONDS=4

At the Python server, after the local model proposes BUY/SELL and before emitting the signal to EA, send only compact technical facts to /evaluate. If HTTP is not 200, JSON is invalid, or decision is not exactly APPROVE, downgrade to HOLD. Cloud AI must never change direction, lot size, SL, TP, or risk settings. Never send account IDs, balances, order tickets, or credentials.

## Model validation caution
The available 3-month GOLD/M15 holdout report indicated 960 samples, test accuracy 51.15%, balanced accuracy 51.13%, and majority baseline 50.63%. This does not establish profitability after spread, commission, slippage, and forward testing. Use demo forward testing before any live integration.
