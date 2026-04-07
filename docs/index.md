---
title: N-Genius Payment Testbed
layout: default
---

# N-Genius Payment Testbed

A local Node.js + Express developer tool for testing the [N-Genius Hosted Payment Page](https://developer.ngenius-payments.com/docs/hosted-payment-page) integration — authentication, order creation, capture, refund, and order listing — from a single browser UI.

> **Run it locally:** clone the repo, add your sandbox credentials, and start testing in under 2 minutes.

```bash
git clone https://github.com/AQaddora/ngenius-hosted-payment-testbed.git
cd ngenius-hosted-payment-testbed
npm install && cp .env.example .env
# fill in your API key and outlet ID in .env
npm start
# open http://localhost:3000
```

---

## Documentation

| | |
|---|---|
| [Getting Started](getting-started) | Installation, credentials, first run |
| [Authentication](authentication) | API key → JWT token flow, manual usage |
| [Creating Orders](creating-orders) | AUTH / PURCHASE / SALE, form fields, amount conversion |
| [Orders & Status](orders) | Orders table, search, details panel, payment states |
| [Capture & Refund](capture-refund) | Full lifecycle — capture, refund, partial refund, settlement |
| [API Reference](api-reference) | All server endpoints with request/response schemas |
| [Test Cards](test-cards) | Sandbox card numbers, test scenarios, webhooks |
| [Production](production) | Go-live checklist, production configuration |

---

## Features

- **Environment toggle** — Sandbox and Production, switchable at runtime
- **Test Authentication** — verify your API key and inspect the decoded JWT
- **Create orders** — AUTH, PURCHASE, SALE with full form control
- **Hosted payment panel** — N-Genius pay page in a slide-in iframe panel
- **Orders table** — paginated live list from the API or local browser session history
- **Order search** — jump to any order by reference
- **Capture** — settle authorised payments with one click
- **Refund** — full or partial refunds from the order details panel
- **Refund status** — check the state of any submitted refund
- **Sandbox test cards** — built-in reference panel

---

## Requirements

- Node.js 18+
- An N-Genius sandbox merchant account ([merchant.sandbox.ngenius-payments.com](https://merchant.sandbox.ngenius-payments.com))
- A **Merchant Service Account API key** and **Outlet ID**

---

## Official N-Genius Documentation

| Resource | Link |
|---|---|
| Developer portal | [developer.ngenius-payments.com](https://developer.ngenius-payments.com) |
| Hosted Payment Page | [developer.ngenius-payments.com/docs/hosted-payment-page](https://developer.ngenius-payments.com/docs/hosted-payment-page) |
| API reference | [developer.ngenius-payments.com/reference](https://developer.ngenius-payments.com/reference) |
| Order states | [developer.ngenius-payments.com/docs/order-states](https://developer.ngenius-payments.com/docs/order-states) |
| Test cards | [developer.ngenius-payments.com/docs/test-cards](https://developer.ngenius-payments.com/docs/test-cards) |
| Merchant portal | [merchant.ngenius-payments.com](https://merchant.ngenius-payments.com) |

---

## Built by

[Ahmed Qaddoura](https://github.com/AQaddora) — [@AQaddora](https://github.com/AQaddora)

[GitHub Repository](https://github.com/AQaddora/ngenius-hosted-payment-testbed) · MIT License
