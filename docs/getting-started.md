---
title: Getting Started
layout: default
---

# Getting Started

**N-Genius Payment Testbed** is a local Node.js + Express server that gives you a full browser UI to test every stage of the [N-Genius Hosted Payment Page](https://developer.ngenius-payments.com) integration — from authentication through capture and refund — without writing a single line of client code.

---

## Navigation

| | |
|---|---|
| [Authentication](authentication.md) | Test your API key and inspect JWT tokens |
| [Creating Orders](creating-orders.md) | Create payment orders and open the hosted pay page |
| [Orders & Status](orders.md) | Browse, search, and inspect orders |
| [Capture & Refund](capture-refund.md) | Capture authorised payments and issue refunds |
| [API Reference](api-reference.md) | All server endpoints with request/response schemas |
| [Test Cards](test-cards.md) | Sandbox card numbers and webhook testing |
| [Production](production.md) | Go-live checklist and production configuration |

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | Download from [nodejs.org](https://nodejs.org) |
| **N-Genius sandbox account** | Register at [merchant.ngenius-payments.com](https://merchant.ngenius-payments.com) |
| **API key** | From Settings → Integrations → Merchant Service Accounts |
| **Outlet ID** | From Settings → Integrations → Outlets (a UUID) |

> You do **not** need production credentials to run the testbed. Sandbox is fully functional for all payment flows.

---

## Installation

### 1. Clone and install dependencies

```bash
git clone https://github.com/AQaddora/ngenius-hosted-payment-testbed.git
cd ngenius-hosted-payment-testbed
npm install
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in your sandbox credentials:

```env
PORT=3000
APP_BASE_URL=http://localhost:3000

# Sandbox (required for all testing)
NGENIUS_BASE_URL=https://api-gateway.sandbox.ngenius-payments.com
NGENIUS_API_KEY=<your_sandbox_api_key>
NGENIUS_OUTLET_ID=<your_sandbox_outlet_id>

# Production (leave blank until you have go-live approval)
NGENIUS_PROD_BASE_URL=https://api-gateway.ngenius-payments.com
NGENIUS_PROD_API_KEY=
NGENIUS_PROD_OUTLET_ID=
```

> **Security:** `.env` is in `.gitignore` and must never be committed. Only `.env.example` (with empty values) belongs in version control.

### 3. Where to find your credentials

1. Log in at [merchant.ngenius-payments.com](https://merchant.ngenius-payments.com)
2. Go to **Settings → Integrations → Merchant Service Accounts**
   - Copy the Base64-encoded API key string
3. Go to **Settings → Integrations → Outlets**
   - Copy the outlet reference (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### 4. Start the server

```bash
# Standard start
npm start

# Development mode (auto-restarts on file changes — requires nodemon)
npm run dev
```

The server starts on **http://localhost:3000** by default. You should see:

```
N-Genius test app running on http://localhost:3000
[sandbox] baseUrl=https://api-gateway.sandbox.ngenius-payments.com | apiKey=XX chars | outletId=xxxxxxxx-…
```

If `apiKey=0 chars` or `outletId=(not set)`, your `.env` was not loaded correctly — check the file path and syntax.

---

## First Run Walkthrough

1. Open **http://localhost:3000** in your browser
2. Confirm the **Mode** badge shows `sandbox` and the **Outlet ID** shows a masked value
3. Expand **Test Authentication** and click **Test Authentication** — you should see `Success ✓`
4. Click **+ New Order**, leave the defaults, and click **Create & Pay**
5. The N-Genius hosted pay page opens in a slide-in panel
6. Enter a [test card number](test-cards.md) and complete the flow
7. The panel auto-closes and the order appears in the **Orders** table with state `PURCHASED` or `CAPTURED`
8. Click **Details →** on the order row to open the Order Details panel
9. If the action was `AUTH`, you can **Capture** the payment from the details panel
10. Once captured and settled, you can issue a **Refund**

That's the full payment lifecycle in one sandbox session.

---

## Project Structure

```
├── server.js               # Express server — all API routes and N-Genius integration
├── public/
│   ├── index.html          # Main dashboard UI
│   ├── app.js              # Dashboard frontend logic (vanilla JS)
│   ├── result.html         # Post-payment return / status page
│   ├── result.js           # Result page logic
│   └── styles.css          # Shared CSS (dark theme)
├── images/                 # Screenshots used in documentation
├── docs/                   # This documentation
│   ├── getting-started.md
│   ├── authentication.md
│   ├── creating-orders.md
│   ├── orders.md
│   ├── capture-refund.md
│   ├── api-reference.md
│   ├── test-cards.md
│   └── production.md
├── .env.example            # Env variable template — safe to commit
├── .env                    # Your credentials — gitignored, never commit
└── package.json
```

---

## Official N-Genius Documentation

| Resource | URL |
|---|---|
| Developer portal | [developer.ngenius-payments.com](https://developer.ngenius-payments.com) |
| Hosted Payment Page guide | [developer.ngenius-payments.com/docs/hosted-payment-page](https://developer.ngenius-payments.com/docs/hosted-payment-page) |
| API reference | [developer.ngenius-payments.com/reference](https://developer.ngenius-payments.com/reference) |
| Merchant portal | [merchant.ngenius-payments.com](https://merchant.ngenius-payments.com) |
| Sandbox portal | [merchant.sandbox.ngenius-payments.com](https://merchant.sandbox.ngenius-payments.com) |

---

*Next: [Authentication →](authentication.md)*
