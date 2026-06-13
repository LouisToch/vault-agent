# VAULT AI Agent Backend

## Environment Variables (set these in Railway)
- `SHOPIFY_TOKEN` — your Shopify Admin API access token
- `SHOPIFY_STORE` — your store URL e.g. `eyrwiy-tb.myshopify.com`
- `ANTHROPIC_API_KEY` — your Anthropic API key

## Endpoints
- `GET /dashboard` — full daily briefing with AI insights
- `POST /ask` — ask the agent anything `{ "question": "what should I do today?" }`
- `GET /products` — list all products
- `GET /orders` — recent orders
