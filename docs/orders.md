---
title: Orders & Status
layout: default
---

# Orders & Status

[← Creating Orders](creating-orders.md) | [Capture & Refund →](capture-refund.md)

---

## Overview

The **Orders** section is the central hub of the testbed. It lists all orders from the N-Genius API (or from your local browser history), lets you search by reference, and opens a detailed side panel for each order where you can capture, refund, and inspect the full raw response.

<p align="center">
  <img src="../images/04.png" width="750" alt="Orders table showing CAPTURED orders with pagination and test cards section" />
</p>

---

## Orders Table

The table shows the most recent orders for your outlet, sorted by date descending.

| Column | Description |
|---|---|
| **Date** | Order creation timestamp, localised to your browser timezone |
| **Order Reference** | Truncated N-Genius order reference (hover for full value) |
| **Action** | `AUTH`, `PURCHASE`, or `SALE` |
| **Amount** | Major units with currency code (e.g. `10.00 AED`) |
| **State** | Colour-coded payment state badge — see [Payment States](#payment-states) |
| *(actions)* | **Pay ↗** (for incomplete orders) and **Details →** buttons |

Clicking anywhere on a row (except the action buttons) opens the Order Details panel.

---

## Source Toggle: From API vs Saved Locally

| Mode | Description |
|---|---|
| **From API** | Fetches live orders from `GET /api/orders?env=<env>` — always current, paginated |
| **Saved locally** | Reads from `localStorage` — works offline, shows only orders created in this browser session |

The testbed automatically falls back to **Saved locally** if the API returns an error (e.g. the production orders endpoint returns 405 for some account types). A notice row appears at the top of the table when this happens.

Local history stores up to **100 orders** in `localStorage` and is automatically updated whenever you create an order or open its details panel.

---

## Pagination

API results are paginated at **10 orders per page**. Use the **← Prev** and **Next →** buttons below the table to navigate. The current page resets to 0 whenever you switch environments or toggle the source.

---

## Searching by Order Reference

Use the **Find by Order ID** input at the top of the orders section to jump directly to any order without scrolling:

1. Paste or type the full order reference
2. Press **Enter** or click **Find**
3. The Order Details panel opens for that reference (fetched live from the API)

This works even for orders not currently visible in the table.

---

## Order Details Panel

<p align="center">
  <img src="../images/01.png" width="750" alt="Main dashboard with Orders section and environment toggle" />
</p>

Click **Details →** (or any row) to open the right-side Order Details panel. It shows:

### Info section

| Field | Description |
|---|---|
| **Reference** | Full N-Genius order reference |
| **State** | Current payment state with colour badge |
| **Action** | `AUTH`, `PURCHASE`, or `SALE` |
| **Amount** | Formatted amount and currency |
| **Payment Ref** | Internal N-Genius payment reference |
| **Capture ID** | Capture identifier — appears after capture (required for refund) |

### Action sections (context-aware)

The panel shows only the actions relevant to the current order state:

| Order state | Available actions |
|---|---|
| `STARTED` / `AWAIT_3DS` | **Open payment page** — complete the pending payment |
| `AUTHORISED` | **Capture Payment** — settle the reserved funds |
| `PURCHASED` / `CAPTURED` | **Refund** — issue a full or partial refund |
| `PARTIALLY_REFUNDED` | **Refund** — issue another partial refund |
| `REFUNDED` / `PARTIALLY_REFUNDED` | **Refund Status** — check status of a specific refund ID |

### Raw response

Expand the **▸ Raw response** accordion at the bottom to see the full JSON from `GET /api/orders/:reference`, including all N-Genius embedded objects.

### Refresh

Click **↻ Refresh** in the panel header to re-fetch the order and update all fields. Useful while waiting for a payment to complete or a refund to settle.

---

## Payment States

| State | Colour | Description |
|---|---|---|
| `STARTED` | Grey | Order created, payment page not yet opened or payment not submitted |
| `AWAIT_3DS` | Blue | Waiting for 3DS authentication to complete |
| `AUTHORISED` | Orange | Funds reserved (AUTH action) — requires Capture |
| `PURCHASED` | Green | Payment completed and auto-captured (PURCHASE/SALE action) |
| `CAPTURED` | Green | Funds captured after AUTH |
| `PARTIALLY_REFUNDED` | Yellow | One or more partial refunds issued |
| `REFUNDED` | Teal | Fully refunded |
| `FAILED` | Red | Payment failed or was declined |
| `VOIDED` | Grey | Auth voided before capture |
| `REVERSED` | Grey | Transaction reversed |

> Official state machine: [developer.ngenius-payments.com/docs/order-states](https://developer.ngenius-payments.com/docs/order-states)

---

## Local History

The testbed maintains a local order history in `localStorage` under the key `ngenius:orderHistory`. It is updated:

- When you **create a new order**
- When you **open the Order Details panel** for any order (state is refreshed)

This lets you track orders across browser sessions without needing the API to be available. The history is capped at 100 entries (oldest are discarded).

### Storage keys

| Key | Value |
|---|---|
| `ngenius:lastOrderReference` | Reference of the most recently created order |
| `ngenius:lastPaymentUrl` | Payment URL of the most recently created order |
| `ngenius:lastPaymentReference` | Payment reference from the most recent order status fetch |
| `ngenius:lastCaptureId` | Capture ID from the most recent capture |
| `ngenius:lastRefundId` | Refund ID from the most recent refund |
| `ngenius:orderHistory` | JSON array of up to 100 order summary objects |

---

## Result Page

`http://localhost:3000/result.html` is the post-payment return page. N-Genius redirects the customer here after completing or abandoning payment on the hosted page.

It:
- Auto-fills the order reference from `localStorage`
- Lets you manually enter any reference
- Supports **auto-refresh** polling to watch for state transitions in real time
- Shows a formatted status summary and the raw API response

---

*[← Creating Orders](creating-orders.md) | [Capture & Refund →](capture-refund.md)*
