---
title: Production
layout: default
---

# Production

[← Test Cards](test-cards.md) | [Getting Started →](getting-started.md)

---

## Overview

The testbed supports both sandbox and production environments via the **Environment** toggle. Before switching to production, your merchant account must have received **go-live approval** from Network International. Do not attempt production transactions without this approval.

> Go-live process: [developer.ngenius-payments.com/docs/go-live](https://developer.ngenius-payments.com/docs/go-live)

---

## Production Configuration

Add your production credentials to `.env`:

```env
# Production
NGENIUS_PROD_BASE_URL=https://api-gateway.ngenius-payments.com
NGENIUS_PROD_API_KEY=<your_production_api_key>
NGENIUS_PROD_OUTLET_ID=<your_production_outlet_id>
```

Restart the server after editing `.env`:

```bash
npm start
```

### Verifying production configuration

1. Switch the environment toggle to **Production**
2. The header should show Mode = `live` and a masked production Outlet ID
3. Expand **Test Authentication** and click **Test Authentication**
4. Confirm `Mode: live` in the result — this proves the production key is valid

---

## Go-Live Checklist

Work through this list before your first production transaction:

### Credentials
- [ ] Production API key obtained from the Merchant Portal
- [ ] Production Outlet ID obtained from the Merchant Portal
- [ ] Both values added to `.env` (or your production secrets manager)
- [ ] Test Authentication passes for the production environment

### Integration
- [ ] `APP_BASE_URL` updated to your real domain (e.g. `https://yourapp.com`)
- [ ] `redirectUrl` in payment orders points to your real domain result page
- [ ] HTTPS enabled on your domain — N-Genius requires TLS for redirect URLs
- [ ] Result page (`/result.html` equivalent) handles the `ref` query parameter correctly

### Webhooks
- [ ] Production webhook URL registered in the N-Genius Merchant Portal
- [ ] Webhook signature verification implemented (see N-Genius docs)
- [ ] Webhook endpoint returns `200 OK` within the timeout window

### Testing
- [ ] End-to-end test with a real low-value transaction (e.g. 1.00 AED)
- [ ] Refund the test transaction to confirm the full cycle works
- [ ] Decline scenario tested (declined card, insufficient funds)
- [ ] 3DS scenario tested if applicable to your card scheme mix

### Security
- [ ] `.env` is not committed to version control
- [ ] Production API key is stored in a secrets manager in deployed environments
- [ ] Server logs do not expose full API keys or raw card data
- [ ] Access to the testbed UI is restricted (not publicly accessible in production)

---

## Switching Environments in the Testbed

The **Environment** toggle at the top of the dashboard switches between sandbox and production:

| Toggle state | Environment used |
|---|---|
| **Sandbox** | Uses `NGENIUS_API_KEY` and `NGENIUS_OUTLET_ID` from `.env` |
| **Production** | Uses `NGENIUS_PROD_API_KEY` and `NGENIUS_PROD_OUTLET_ID` from `.env` |

All API endpoints (`/api/create-payment`, `/api/orders`, etc.) pass `?env=production` when production is active. The server selects the correct credentials based on this parameter.

---

## Deploying the Testbed

The testbed is designed for **local development use**. If you deploy it to a server:

1. Set `APP_BASE_URL` to your server's public URL
2. Use a process manager like PM2 or systemd to keep it running
3. Restrict access — do not expose the testbed to the public internet
4. Use environment variables or a secrets manager instead of a `.env` file
5. Set `NODE_ENV=production` for security hardening

```bash
# Example PM2 deployment
pm2 start server.js --name ngenius-testbed
pm2 save
```

> The testbed is not hardened for public internet exposure. It is intended as an internal developer tool.

---

## Common Production Issues

| Issue | Cause | Fix |
|---|---|---|
| `API key not set for production` | `NGENIUS_PROD_API_KEY` is empty | Add production credentials to `.env` |
| Auth succeeds but shows `mode: sandbox` | Wrong `NGENIUS_PROD_BASE_URL` | Must be `https://api-gateway.ngenius-payments.com` (no `sandbox`) |
| Orders list returns 405 | Some production accounts don't support order listing | Use **Saved locally** mode in the orders table |
| Redirect fails after payment | `redirectUrl` is `localhost` | Set `APP_BASE_URL` to your public domain in `.env` |
| Refund rejected | Capture not settled | Wait for end-of-day settlement batch |

---

## N-Genius Support

| Resource | URL |
|---|---|
| Developer portal | [developer.ngenius-payments.com](https://developer.ngenius-payments.com) |
| Merchant portal | [merchant.ngenius-payments.com](https://merchant.ngenius-payments.com) |
| Status page | [status.ngenius-payments.com](https://status.ngenius-payments.com) |
| Support | Contact via the Merchant Portal |

---

*[← Test Cards](test-cards.md) | [Getting Started →](getting-started.md)*
