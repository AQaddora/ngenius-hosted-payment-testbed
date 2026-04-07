---
title: API Reference
layout: default
---

# API Reference

[← Capture & Refund](capture-refund.md) | [Test Cards →](test-cards.md)

---

## Overview

The testbed exposes a local REST API at `http://localhost:3000/api/`. All endpoints are thin proxies that handle N-Genius authentication and forward requests to the N-Genius API. They never expose your raw API key to the browser.

All endpoints accept a `?env=` query parameter:

| Value | Target |
|---|---|
| `sandbox` *(default)* | N-Genius sandbox environment |
| `production` | N-Genius production environment |

All responses are JSON. On error, the response includes a human-readable `message` and, where available, the raw N-Genius `details` object.

---

## Endpoints

### `GET /api/health`

Returns the server's configuration status for both environments. Safe to call without credentials.

**Response**
```json
{
  "ok": true,
  "sandbox": {
    "mode": "sandbox",
    "missingEnv": []
  },
  "production": {
    "mode": "live",
    "missingEnv": ["NGENIUS_PROD_API_KEY", "NGENIUS_PROD_OUTLET_ID"]
  },
  "now": "2025-04-07T12:00:00.000Z"
}
```

`missingEnv` lists any required environment variables that are not set. An empty array means the environment is fully configured.

---

### `GET /api/config`

Returns the current runtime configuration for the selected environment. All sensitive values are masked.

**Query params:** `?env=sandbox`

**Response**
```json
{
  "ok": true,
  "env": "sandbox",
  "appBaseUrl": "http://localhost:3000",
  "ngeniusBaseUrl": "https://api-gateway.sandbox.ngenius-payments.com",
  "mode": "sandbox",
  "outletIdMasked": "xxxx****-****-****-****-********xxxx",
  "apiKeyMasked": "xxxxxx********************xxxx",
  "missingEnv": []
}
```

---

### `GET /api/test-auth`

Tests authentication by requesting an access token and decoding the JWT claims. Returns the full token for use in manual API calls.

**Query params:** `?env=sandbox`

**Response (success)**
```json
{
  "ok": true,
  "env": "sandbox",
  "mode": "sandbox",
  "maskedToken": "eyJhbGci…eyJleHA",
  "fullToken": "<full JWT>",
  "expiresIn": "2025-04-07T12:05:00.000Z",
  "accountName": "My Service Account",
  "realm": "ni",
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "accountType": "serviceAccount",
  "hierarchyRefs": ["ref1", "ref2"],
  "roles": ["role1", "role2"],
  "missingEnv": []
}
```

**Response (failure)**
```json
{
  "ok": false,
  "env": "sandbox",
  "message": "Failed to get N-Genius access token.",
  "details": { ... }
}
```

---

### `POST /api/create-payment`

Creates a new N-Genius payment order and returns the hosted pay page URL.

**Query params:** `?env=sandbox`

**Request body**
```json
{
  "amount": "10.00",
  "currencyCode": "AED",
  "emailAddress": "customer@example.com",
  "action": "PURCHASE",
  "language": "en",
  "redirectUrl": "https://yourapp.com/result.html",
  "itemDescription": "Test order"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | string/number | Yes | Major units — server converts to minor (×100) |
| `currencyCode` | string | Yes | ISO 4217 (e.g. `AED`, `USD`) — uppercased automatically |
| `emailAddress` | string | No | Customer email |
| `action` | string | No | `PURCHASE` (default), `AUTH`, or `SALE` |
| `language` | string | No | `en` (default) or `ar` |
| `redirectUrl` | string | No | Defaults to `APP_BASE_URL/result.html`. `localhost` URLs are substituted with `https://example.com` |
| `itemDescription` | string | No | Defaults to `Test payment` |

**Response (success)**
```json
{
  "ok": true,
  "env": "sandbox",
  "mode": "sandbox",
  "orderReference": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "paymentReference": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "paymentState": "STARTED",
  "paymentUrl": "https://paypage.sandbox.ngenius-payments.com/?ref=...",
  "order": { ... }
}
```

---

### `GET /api/orders`

Lists orders for the configured outlet, paginated.

**Query params:** `?env=sandbox&page=0&pageSize=10`

| Param | Default | Notes |
|---|---|---|
| `page` | `0` | Zero-based page number |
| `pageSize` | `20` | Capped at 50 |

**Response**
```json
{
  "ok": true,
  "env": "sandbox",
  "orders": [
    {
      "reference": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "action": "PURCHASE",
      "amount": { "currencyCode": "AED", "value": 1000 },
      "formattedAmount": "10.00 AED",
      "createDateTime": "2025-04-07T12:00:00.000Z",
      "paymentState": "PURCHASED",
      "paymentReference": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "paymentUrl": "https://paypage.sandbox.ngenius-payments.com/?ref=..."
    }
  ],
  "page": {
    "number": 0,
    "size": 10,
    "totalElements": 42,
    "totalPages": 5
  }
}
```

---

### `GET /api/orders/:reference`

Fetches a single order by reference. Also performs a secondary payment lookup to resolve the capture ID for captured orders.

**Query params:** `?env=sandbox`

**Response**
```json
{
  "ok": true,
  "env": "sandbox",
  "orderReference": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "action": "AUTH",
  "amount": { "currencyCode": "AED", "value": 1000 },
  "paymentState": "CAPTURED",
  "paymentReference": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "captureId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "paymentUrl": "https://paypage.sandbox.ngenius-payments.com/?ref=...",
  "order": { ... }
}
```

`captureId` is extracted from the embedded `cnp:capture` objects or from capture links on the payment. It is `null` for orders that have not been captured.

---

### `POST /api/orders/:orderRef/payments/:paymentRef/captures`

Captures a previously authorised payment (`AUTH` action orders only).

**Query params:** `?env=sandbox`

**Request body**
```json
{
  "amount": "10.00",
  "currencyCode": "AED"
}
```

**Response**
```json
{
  "ok": true,
  "env": "sandbox",
  "captureId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "capture": { ... }
}
```

**Error — already captured (PURCHASE/SALE):**
```json
{
  "ok": false,
  "message": "Payment is already captured (PURCHASE/SALE auto-captures on payment). Skip this step — go directly to Refund once the capture is settled."
}
```

---

### `POST /api/orders/:orderRef/payments/:paymentRef/captures/:captureId/refund`

Issues a full or partial refund against a captured payment. Requires the capture to be settled (end-of-day batch).

**Query params:** `?env=sandbox`

**Request body**
```json
{
  "amount": "10.00",
  "currencyCode": "AED"
}
```

**Response**
```json
{
  "ok": true,
  "env": "sandbox",
  "refundId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "payment": { ... }
}
```

**Error — not yet settled:**
```json
{
  "ok": false,
  "message": "Capture is not yet settled. N-Genius only allows refunds on settled transactions (end-of-day batch). Try again after settlement, or use the sandbox the next day."
}
```

---

### `GET /api/orders/:orderRef/payments/:paymentRef/captures/:captureId/refund/:refundId`

Fetches the status of a specific refund.

**Query params:** `?env=sandbox`

**Response**
```json
{
  "ok": true,
  "env": "sandbox",
  "refund": {
    "state": "SUCCESS",
    "amount": { "currencyCode": "AED", "value": 1000 },
    ...
  }
}
```

---

## Error Response Format

All error responses follow this shape:

```json
{
  "ok": false,
  "env": "sandbox",
  "message": "Human-readable error description",
  "details": {
    "errors": [
      { "errorCode": "notRefundable", "message": "..." }
    ]
  }
}
```

HTTP status codes mirror the upstream N-Genius response where possible, defaulting to `500` for unexpected errors and `400` for missing configuration.

---

## Direct N-Genius API (Bypassing the Testbed)

You can call the N-Genius API directly using a token from `/api/test-auth`. Use the `fullToken` field:

```bash
# List orders directly
curl -H "Authorization: Bearer <fullToken>" \
     -H "Accept: application/vnd.ni-payment.v2+json" \
     "https://api-gateway.sandbox.ngenius-payments.com/transactions/outlets/<outletId>/orders"

# Get a specific order
curl -H "Authorization: Bearer <fullToken>" \
     -H "Accept: application/vnd.ni-payment.v2+json" \
     "https://api-gateway.sandbox.ngenius-payments.com/transactions/outlets/<outletId>/orders/<orderRef>"
```

> Official N-Genius API reference: [developer.ngenius-payments.com/reference](https://developer.ngenius-payments.com/reference)

---

*[← Capture & Refund](capture-refund.md) | [Test Cards →](test-cards.md)*
