# VOOM AI Analysis API Contract v1

Status: implementation branch draft. This contract is not deployed.

## Endpoint

- Method: `POST`
- Path: `/v1/analysis/candles`
- Host: NOVA System Hub Worker
- Authentication: Supabase user access token in `Authorization: Bearer <access_token>`
- Content-Type: `application/json`
- Request limit: 128 KiB
- No persistence, broker calls, order submission, or external market-data lookup.

## Request

```json
{
  "symbol": "XAUUSDm",
  "timeframe": "H1",
  "candles": [
    { "t": 1790000000000, "o": 2000.0, "h": 2001.0, "l": 1999.0, "c": 2000.5, "v": 120 }
  ]
}
```

- `t`: strictly increasing Unix epoch milliseconds (or ISO-8601 string).
- `o/h/l/c`: finite positive prices; high/low must contain open and close.
- `v`: finite non-negative volume.
- `symbol`: 1–40 characters, alphanumeric plus dot, underscore, or hyphen.
- `timeframe`: M1, M5, M15, M30, H1, H4, D1.
- Candle count: 35–500, ascending and unique timestamps.

## Response

- `signal`: BUY, SELL, HOLD.
- `confidence`: heuristic score 0–1, explicitly **not a calibrated probability**.
- `predicted_price`: null until a validated prediction model and evaluation evidence exist.
- `model_version`: technical-rules-v1 (deterministic indicator rules, not an ML model).
- `reasons` and `indicators`: explainable rule inputs.
- `input.source`: client_supplied_ohlcv. This endpoint does not certify that supplied candles came from a broker.
- `executionEnabled`, `ordersEnabled`, `liveTradingEnabled`: always false.

## Security and behavior

- Authentication is required for this endpoint; unauthenticated calls fail closed.
- CORS remains restricted to configured origins. Native Android clients are not authorized by CORS; they must supply a valid access token.
- Request body is size-limited and schema-validated.
- No account identifiers are accepted. No database writes or tenant data reads are performed.
- No live prices are fetched. Analysis applies only to the submitted candle array.
- The System Hub's existing Supabase Auth validation is reused. It validates the bearer token through the configured Supabase Auth user endpoint.
- The endpoint does not submit or prepare broker orders.

## Error responses

- 400: malformed JSON, unsupported symbol/timeframe, invalid OHLCV, candle count/order.
- 401: missing or invalid/expired Supabase session.
- 413: request body exceeds 128 KiB.
- 415: non-JSON content type.
- 503: Supabase Auth not configured or unavailable.

## Client compatibility note

The legacy Android APK used a non-versioned `POST /analyze` request with `symbol`, `timeframe`, and `candles`. VOOM AI should call this versioned route and treat `predicted_price: null` as unavailable, not display a fabricated target. Any legacy adapter must be client-side and must not introduce a second unversioned production API.
