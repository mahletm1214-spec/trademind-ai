# API contract

GET `/api/health`

GET `/api/trades`

POST `/api/trades`
Body: ICT trade journal object (`user_id`, `symbol`, `direction`, entry/stop/target, model, bias, liquidity, structure, PD array, kill zone, notes).

POST `/api/ai/review`
Body: structured journal/checklist/vision payload. Returns process review JSON.

GET `/api/economic-calendar?from=...&to=...&currency=USD`
Returns normalized provider output when configured.
