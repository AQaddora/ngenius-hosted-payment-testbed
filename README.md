# N-Genius Hosted Payment Page — Test App

A minimal Node.js + Express testing environment for the [Network International / N-Genius](https://developer.ngenius-payments.com) Hosted Payment Page integration.

It provides a local dashboard where you can test authentication, create sandbox or production payment orders, open the hosted pay page, and check order status — all from a single browser UI.

---

## Requirements

- [Node.js](https://nodejs.org) 18 or later
- An N-Genius sandbox merchant account with:
  - A **Merchant Service Account API key**
  - An **Outlet ID (outlet reference)**

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/AQaddora/ngenius-hosted-payment-testbed.git
cd network-ngenius-test
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:

```env
PORT=3000
APP_BASE_URL=http://localhost:3000

# Sandbox
NGENIUS_BASE_URL=https://api-gateway.sandbox.ngenius-payments.com
NGENIUS_API_KEY=<your_sandbox_api_key>
NGENIUS_OUTLET_ID=<your_sandbox_outlet_id>

# Production (only after go-live approval — leave blank for sandbox-only testing)
NGENIUS_PROD_BASE_URL=https://api-gateway.ngenius-payments.com
NGENIUS_PROD_API_KEY=
NGENIUS_PROD_OUTLET_ID=
```

> **Never commit `.env`** — it is excluded by `.gitignore`. Only `.env.example` (with empty values) should be committed.

### 3. Where to find your credentials

1. Log in to the [N-Genius Merchant Portal](https://merchant.ngenius-payments.com)
2. Go to **Settings → Integrations → Merchant Service Accounts** — copy the API key
3. Go to **Settings → Integrations → Outlets** — copy the outlet reference (UUID)

### 4. Start the server

```bash
npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

The server starts on **http://localhost:3000** by default.

---

## Dashboard Overview

Open **http://localhost:3000** in your browser. The dashboard has three main sections.

### Environment toggle

Switch between **Sandbox** and **Production** at the top of the page. All subsequent actions use the selected environment. The header also shows the active mode, masked Outlet ID, and server URL pulled from your `.env`.

### Step 0 — Test Authentication

Click **Test Authentication** to verify your API key is valid. On success, it shows:

| Field | Description |
|---|---|
| Status | Success / Failed |
| Account Name | The service account name from N-Genius |
| Realm | Identity realm |
| Account Type | Account classification |
| Token Expires | Access token expiry time |
| Mode | `sandbox` or `live` |
| Access Token | Full JWT for manual API testing (copy/paste) |

<p align="center">
  <img src="images/01.png" width="700" alt="Dashboard header and Test Authentication panel" />
</p>

### Step 1 — Create a Test Payment

Fill in the payment form and click **Create payment**:

| Field | Description |
|---|---|
| Amount | Payment amount in major units (e.g. `10.00`) |
| Currency | ISO 4217 code (e.g. `USD`, `AED`) |
| Action | `AUTH` (authorise only), `PURCHASE`, or `SALE` |
| Language | `en` (English) or `ar` (Arabic) |
| Email | Customer email address |
| Item description | Line item description shown on the pay page |
| Redirect URL | Where the gateway returns the browser after payment |

Check **Open the hosted pay page automatically** to be redirected to the N-Genius payment page immediately after order creation.

The raw API response is shown in the **Order Result** panel at the bottom, including the order reference and payment URL.

### Step 2 — Check Order Status

After completing or abandoning a payment on the hosted pay page, return to the dashboard and click **Fetch status** to see the current order state. Use **Use last reference** to auto-fill the order reference from the previous step.

<p align="center">
  <img src="images/02.png" width="700" alt="Create payment form and Check order status panel" />
</p>

---

## Result Page

`http://localhost:3000/result.html` is the post-payment return page. It:

- Auto-fills the order reference from `localStorage` (set when the order was created)
- Lets you manually enter a reference
- Supports **auto-refresh** polling to watch for state transitions

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check — shows env config status |
| `GET` | `/api/config?env=sandbox` | Current config (values are masked) |
| `GET` | `/api/test-auth?env=sandbox` | Test API key authentication |
| `POST` | `/api/create-payment?env=sandbox` | Create a new payment order |
| `GET` | `/api/orders/:reference?env=sandbox` | Fetch order status by reference |

All endpoints accept `?env=sandbox` (default) or `?env=production`.

---

## Test Flow

1. Open **http://localhost:3000**
2. Ensure the environment toggle shows **Sandbox**
3. Click **Test Authentication** — confirm you get a success response
4. Fill in the payment form and click **Create payment**
5. The browser is redirected to the N-Genius hosted pay page
6. Enter a [test card number](#sandbox-test-cards) and complete the flow
7. The gateway redirects back to `/result.html`
8. Click **Check now** (or return to the main page and use **Fetch status**) to confirm the final payment state

---

## Sandbox Test Cards

Use these card numbers on the hosted pay page. Any CVV and any future expiry date are accepted unless your test case specifies otherwise.

| Scheme | PAN | Expected Outcome |
|---|---|---|
| Visa | `4111111111111111` | Approved (00) |
| Visa | `4663295942784758` | Declined (05) |
| Mastercard | `5168441223630339` | Approved (00) |
| Mastercard | `5513935292057458` | Declined (05) |

<p align="center">
  <img src="images/03.png" width="700" alt="Sandbox test cards and Order Result JSON panel" />
</p>

---

## Testing Webhooks Locally

N-Genius requires a publicly accessible URL to send webhook notifications. Use a tunnel tool to expose your local server:

```bash
# ngrok
ngrok http 3000

# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000
```

Register the generated public URL in the N-Genius portal under **Settings → Integrations → Webhooks**.

---

## Switching to Production

Only after your merchant account has received go-live approval from Network International:

1. Set `NGENIUS_PROD_API_KEY` and `NGENIUS_PROD_OUTLET_ID` in `.env`
2. Switch the environment toggle to **Production** in the dashboard
3. Update `APP_BASE_URL` to your real domain if deploying
4. Register your real domain webhook URL in the portal

---

## Project Structure

```
├── server.js          # Express server — API routes and N-Genius integration
├── public/
│   ├── index.html     # Main dashboard
│   ├── app.js         # Dashboard frontend logic
│   ├── result.html    # Post-payment return / status page
│   ├── result.js      # Result page logic
│   └── styles.css     # Shared styles
├── .env.example       # Environment variable template (no credentials)
├── .env               # Your local credentials — gitignored, never committed
└── package.json
```

---

## Notes

- **Amount conversion:** the form accepts major units (e.g. `10.00 AED`); the server converts to minor units (fils/cents) before sending to N-Genius.
- **Access tokens:** a fresh token is requested for every API call. N-Genius tokens expire after 5 minutes.
- **Localhost redirect URLs:** N-Genius rejects `localhost` redirect URLs. The server automatically substitutes `https://example.com` for local testing. For a real callback, use a tunnel URL.
