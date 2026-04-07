require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function getEnvConfig(env, req) {
  const isProd = env === 'production';
  const cfg = isProd ? {
    baseUrl: (process.env.NGENIUS_PROD_BASE_URL || 'https://api-gateway.ngenius-payments.com').replace(/\/$/, ''),
    apiKey:   process.env.NGENIUS_PROD_API_KEY  || '',
    outletId: process.env.NGENIUS_PROD_OUTLET_ID || ''
  } : {
    baseUrl: (process.env.NGENIUS_BASE_URL || 'https://api-gateway.sandbox.ngenius-payments.com').replace(/\/$/, ''),
    apiKey:   process.env.NGENIUS_API_KEY  || '',
    outletId: process.env.NGENIUS_OUTLET_ID || ''
  };
  // Fall back to client-supplied credentials when env vars are absent
  if (req) {
    if (!cfg.apiKey)   cfg.apiKey   = req.headers['x-ngenius-api-key']   || '';
    if (!cfg.outletId) cfg.outletId = req.headers['x-ngenius-outlet-id'] || '';
  }
  return cfg;
}

function getMissingEnv(env, req) {
  const cfg = getEnvConfig(env, req);
  const missing = [];
  if (!cfg.apiKey)   missing.push(env === 'production' ? 'NGENIUS_PROD_API_KEY'   : 'NGENIUS_API_KEY');
  if (!cfg.outletId) missing.push(env === 'production' ? 'NGENIUS_PROD_OUTLET_ID' : 'NGENIUS_OUTLET_ID');
  return missing;
}

function maskValue(value, start = 4, end = 4) {
  if (!value) return '';
  if (value.length <= start + end) return '*'.repeat(value.length);
  return `${value.slice(0, start)}${'*'.repeat(value.length - start - end)}${value.slice(-end)}`;
}

function amountToMinorUnits(amount) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  return Math.round(parsed * 100);
}

function normalizeCurrency(currencyCode) {
  return String(currencyCode || 'USD').trim().toUpperCase();
}

function getLatestPayment(order) {
  const payments = order?._embedded?.payment;
  if (!Array.isArray(payments) || payments.length === 0) return null;
  return payments[0];
}

function getLatestCapture(payment) {
  // N-Genius uses different keys depending on payment action/version
  const captures =
    payment?._embedded?.['cnp:capture'] ||
    payment?._embedded?.['cnp:captures'] ||
    payment?._embedded?.captures ||
    payment?._embedded?.capture;
  if (Array.isArray(captures) && captures.length > 0) return captures[0];
  if (captures && typeof captures === 'object' && !Array.isArray(captures)) return captures;
  return null;
}

function extractCaptureId(capture) {
  if (!capture) return null;
  // Scan every _link href — capture objects may only have cnp:refund (no self link)
  for (const link of Object.values(capture._links || {})) {
    const href = link?.href;
    if (href) {
      const match = href.match(/\/captures\/([^/?#]+)/);
      if (match) return match[1];
    }
  }
  return capture?.id || capture?.captureId || null;
}

// Fallback: extract captureId from payment's links when no embedded capture object exists
function extractCaptureIdFromPayment(payment) {
  // 1. Try embedded capture objects (AUTH → explicit capture)
  const captured = extractCaptureId(getLatestCapture(payment));
  if (captured) return captured;

  // 2. Try every _links href that contains /captures/{id} — covers:
  //    cnp:refund  → .../captures/{captureId}/refunds  (most reliable for SALE/PURCHASE)
  //    cnp:void    → .../captures/{captureId}/...
  //    cnp:capture → .../captures/{captureId}  (only present after an explicit capture)
  const linkHrefs = Object.values(payment?._links || {}).map(l => l?.href).filter(Boolean);
  for (const href of linkHrefs) {
    const match = href.match(/\/captures\/([^/?#]+)/);
    if (match) return match[1];
  }

  // 3. Also scan every link inside each embedded object
  for (const key of Object.keys(payment?._embedded || {})) {
    const items = [].concat(payment._embedded[key]);
    for (const item of items) {
      for (const link of Object.values(item?._links || {})) {
        const href = link?.href;
        if (href) {
          const match = href.match(/\/captures\/([^/?#]+)/);
          if (match) return match[1];
        }
      }
    }
  }

  return null;
}

function extractRefundId(paymentResponse) {
  const refunds = paymentResponse?._embedded?.['cnp:refund'];
  if (!Array.isArray(refunds) || refunds.length === 0) return null;
  const refund = refunds[refunds.length - 1];
  const href = refund?._links?.self?.href;
  if (href) {
    const match = href.match(/refund\/([^/]+)/);
    if (match) return match[1];
  }
  return refund?.id || null;
}
async function getAccessToken(cfg) {
  const response = await fetch(`${cfg.baseUrl}/identity/auth/access-token`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.ni-identity.v1+json',
      authorization: `Basic ${String(cfg.apiKey).trim()}`,
      'content-type': 'application/vnd.ni-identity.v1+json'
    },
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok || !json?.access_token) {
    const error = new Error('Failed to get N-Genius access token.');
    error.details = json;
    error.status = response.status;
    throw error;
  }

  return json.access_token;
}
async function createOrder(payload, cfg) {
  const accessToken = await getAccessToken(cfg);
  const response = await fetch(
    `${cfg.baseUrl}/transactions/outlets/${cfg.outletId}/orders`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.ni-payment.v2+json',
        'content-type': 'application/vnd.ni-payment.v2+json'
      },
      body: JSON.stringify(payload)
    }
  );

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const error = new Error('Failed to create N-Genius order.');
    error.details = json;
    error.status = response.status;
    throw error;
  }

  return json;
}

async function capturePayment(orderRef, paymentRef, amount, currency, cfg) {
  const accessToken = await getAccessToken(cfg);
  const url = `${cfg.baseUrl}/transactions/outlets/${cfg.outletId}/orders/${encodeURIComponent(orderRef)}/payments/${encodeURIComponent(paymentRef)}/captures`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.ni-payment.v2+json',
      'content-type': 'application/vnd.ni-payment.v2+json'
    },
    body: JSON.stringify({ amount: { currencyCode: currency, value: amount } })
  });

  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  if (!response.ok) {
    const error = new Error('Failed to capture payment.');
    error.details = json;
    error.status = response.status;
    throw error;
  }
  return json;
}

async function refundCapture(orderRef, paymentRef, captureId, amount, currency, cfg) {
  const accessToken = await getAccessToken(cfg);
  const url = `${cfg.baseUrl}/transactions/outlets/${cfg.outletId}/orders/${encodeURIComponent(orderRef)}/payments/${encodeURIComponent(paymentRef)}/captures/${encodeURIComponent(captureId)}/refund`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.ni-payment.v2+json',
      'content-type': 'application/vnd.ni-payment.v2+json'
    },
    body: JSON.stringify({ amount: { currencyCode: currency, value: amount } })
  });

  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  if (!response.ok) {
    const error = new Error('Failed to refund capture.');
    error.details = json;
    error.status = response.status;
    throw error;
  }
  return json;
}

async function listOrders(cfg, page = 0, pageSize = 20) {
  const accessToken = await getAccessToken(cfg);
  const url = `${cfg.baseUrl}/transactions/outlets/${cfg.outletId}/orders?page=${page}&pageSize=${pageSize}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.ni-payment.v2+json' }
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`Failed to list orders (${response.status}).`);
    error.details = json; error.status = response.status; throw error;
  }
  return json;
}

async function getPayment(orderRef, paymentRef, cfg) {
  const accessToken = await getAccessToken(cfg);
  const url = `${cfg.baseUrl}/transactions/outlets/${cfg.outletId}/orders/${encodeURIComponent(orderRef)}/payments/${encodeURIComponent(paymentRef)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.ni-payment.v2+json' }
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) {
    const error = new Error('Failed to get payment.');
    error.details = json; error.status = response.status; throw error;
  }
  return json;
}


async function getRefund(orderRef, paymentRef, captureId, refundId, cfg) {
  const accessToken = await getAccessToken(cfg);
  const url = `${cfg.baseUrl}/transactions/outlets/${cfg.outletId}/orders/${encodeURIComponent(orderRef)}/payments/${encodeURIComponent(paymentRef)}/captures/${encodeURIComponent(captureId)}/refund/${encodeURIComponent(refundId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.ni-payment.v2+json'
    }
  });

  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  if (!response.ok) {
    const error = new Error('Failed to retrieve refund.');
    error.details = json;
    error.status = response.status;
    throw error;
  }
  return json;
}

async function getOrder(reference, cfg) {
  const accessToken = await getAccessToken(cfg);
  const response = await fetch(
    `${cfg.baseUrl}/transactions/outlets/${cfg.outletId}/orders/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.ni-payment.v2+json'
      }
    }
  );

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const error = new Error('Failed to retrieve N-Genius order status.');
    error.details = json;
    error.status = response.status;
    throw error;
  }

  return json;
}

app.get('/api/test-auth', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env, req);
  try {
    const missing = getMissingEnv(env, req);
    if (!cfg.apiKey) {
      return res.status(400).json({ ok: false, message: `API key not set for ${env}.` });
    }

    const token = await getAccessToken(cfg);

    // Decode JWT payload (middle segment)
    let claims = null;
    try {
      const payload = token.split('.')[1];
      const padded = payload + '=='.slice((payload.length + 3) % 4 > 0 ? (payload.length + 3) % 4 - 4 : 0);
      claims = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch {
      claims = null;
    }

    const maskedToken = token.length > 20
      ? `${token.slice(0, 10)}…${token.slice(-10)}`
      : token;

    return res.json({
      ok: true,
      env,
      mode: cfg.baseUrl.includes('sandbox') ? 'sandbox' : 'live',
      maskedToken,
      fullToken: token,
      expiresIn: claims?.exp ? new Date(claims.exp * 1000).toISOString() : null,
      accountName: claims?.given_name || null,
      realm: claims?.realm || null,
      clientId: claims?.clientId || null,
      accountType: claims?.for || null,
      hierarchyRefs: claims?.hierarchyRefs || [],
      roles: claims?.realm_access?.roles || [],
      missingEnv: missing
    });
  } catch (error) {
    console.error('Auth test error:', error.message, JSON.stringify(error.details, null, 2));
    return res.status(error.status || 500).json({
      ok: false,
      env,
      message: error.message || 'Authentication failed.',
      details: error.details || null
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    sandbox: { mode: 'sandbox', missingEnv: getMissingEnv('sandbox') },
    production: { mode: 'live', missingEnv: getMissingEnv('production') },
    now: new Date().toISOString()
  });
});

app.get('/api/config', (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env, req);
  res.json({
    ok: true,
    env,
    appBaseUrl: APP_BASE_URL,
    ngeniusBaseUrl: cfg.baseUrl,
    mode: cfg.baseUrl.includes('sandbox') ? 'sandbox' : 'live',
    outletIdMasked: maskValue(cfg.outletId),
    apiKeyMasked: maskValue(cfg.apiKey, 6, 4),
    missingEnv: getMissingEnv(env, req)
  });
});

app.post('/api/create-payment', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env, req);
  try {
    const missing = getMissingEnv(env, req);
    if (missing.length) {
      return res.status(400).json({
        ok: false,
        message: 'Missing required environment variables.',
        missingEnv: missing
      });
    }

    const {
      amount,
      currencyCode,
      emailAddress,
      action,
      language,
      redirectUrl,
      itemDescription
    } = req.body;

    const minorUnits = amountToMinorUnits(amount);
    const currency = normalizeCurrency(currencyCode);
    const paymentAction = String(action || 'AUTH').toUpperCase();
    const lang = String(language || 'en').toLowerCase();
    const safeEmail = String(emailAddress || '').trim();
    const rawRedirectUrl = String(redirectUrl || `${APP_BASE_URL}/result.html`).trim();
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(rawRedirectUrl);
    const safeRedirectUrl = isLocalhost ? 'https://example.com' : rawRedirectUrl;
    const safeDescription = String(itemDescription || 'Test payment').trim();

    const orderPayload = {
      action: paymentAction,
      amount: {
        currencyCode: currency,
        value: minorUnits
      },
      emailAddress: safeEmail,
      language: lang,
      merchantAttributes: {
        redirectUrl: safeRedirectUrl
      },
      paymentMethods: ['CARD', 'APPLE_PAY', 'SAMSUNG_PAY'],
      categorizedOrderSummary: false,
      orderSummary: {
        total: {
          currencyCode: currency,
          value: minorUnits
        },
        items: [
          {
            description: safeDescription,
            quantity: 1,
            totalPrice: {
              currencyCode: currency,
              value: minorUnits
            }
          }
        ]
      }
    };

    const order = await createOrder(orderPayload, cfg);
    const latestPayment = getLatestPayment(order);

    console.log(`[ORDER] ${new Date().toISOString()} | CREATED | env=${env} | ref=${order.reference} | amount=${orderPayload.amount.value} ${orderPayload.amount.currencyCode} | action=${paymentAction} | state=${latestPayment?.state || '—'}`);
    console.log(`[ORDER] pay page: ${order?._links?.payment?.href || '—'}`);

    return res.json({
      ok: true,
      env,
      mode: cfg.baseUrl.includes('sandbox') ? 'sandbox' : 'live',
      orderReference: order.reference,
      paymentReference: latestPayment?.reference || null,
      paymentState: latestPayment?.state || null,
      paymentUrl: order?._links?.payment?.href || null,
      order
    });
  } catch (error) {
    console.error('Create payment error:', error.message, JSON.stringify(error.details, null, 2));
    return res.status(error.status || 500).json({
      ok: false,
      env,
      message: error.message || 'Unexpected error while creating payment.',
      details: error.details || null
    });
  }
});

app.get('/api/orders', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env, req);
  const page     = Math.max(0, parseInt(req.query.page) || 0);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
  try {
    const missing = getMissingEnv(env, req);
    if (missing.length) return res.status(400).json({ ok: false, message: 'Missing env config.', missingEnv: missing });

    const result = await listOrders(cfg, page, pageSize);

    // N-Genius may embed orders under various keys
    const raw = result?._embedded?.['payment:order']
      || result?._embedded?.['cnp:order']
      || result?._embedded?.orders
      || (Array.isArray(result) ? result : []);

    const orders = raw.map(o => {
      const pay = getLatestPayment(o);
      return {
        reference:        o.reference,
        action:           o.action,
        amount:           o.amount,
        formattedAmount:  o.formattedAmount || null,
        createDateTime:   o.createDateTime,
        paymentState:     pay?.state || null,
        paymentReference: pay?.reference || null,
        paymentUrl:       o?._links?.payment?.href || null
      };
    });

    return res.json({
      ok: true, env, orders,
      page: result?.page || { number: page, size: pageSize, totalElements: orders.length, totalPages: 1 }
    });
  } catch (error) {
    console.error('List orders error:', error.message);
    return res.status(error.status || 500).json({ ok: false, env, message: error.message, details: error.details });
  }
});

app.get('/api/orders/:reference', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env, req);
  try {
    const missing = getMissingEnv(env, req);
    if (missing.length) {
      return res.status(400).json({
        ok: false,
        message: 'Missing required environment variables.',
        missingEnv: missing
      });
    }

    const order = await getOrder(req.params.reference, cfg);
    const latestPayment = getLatestPayment(order);
    let captureId = extractCaptureIdFromPayment(latestPayment);

    // For PURCHASED/CAPTURED payments the order response may not embed captures —
    // fall back to listing them directly from the captures collection.
    const needsCaptureLookup = !captureId &&
      latestPayment?.reference &&
      ['PURCHASED', 'CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(latestPayment?.state);

    if (needsCaptureLookup) {
      // GET /captures returns 405 — N-Genius only accepts POST there.
      // Fetch the payment object directly; it may embed capture data the order summary omits.
      try {
        const payment = await getPayment(order.reference, latestPayment.reference, cfg);
        const embeddedKeys = payment?._embedded ? Object.keys(payment._embedded) : [];
        const linkKeys     = payment?._links     ? Object.keys(payment._links)     : [];
        console.log(`[PAYMENT-DIRECT] state=${payment?.state} | _embedded keys: [${embeddedKeys}] | _links keys: [${linkKeys}]`);
        // Log the raw capture object so we can see its exact structure
        if (payment?._embedded?.['cnp:capture']) {
          console.log(`[PAYMENT-DIRECT] cnp:capture raw:`, JSON.stringify(payment._embedded['cnp:capture'], null, 2));
        }
        captureId = extractCaptureIdFromPayment(payment);
        if (captureId) console.log(`[PAYMENT-DIRECT] captureId found: ${captureId}`);
        else           console.log(`[PAYMENT-DIRECT] captureId not found in payment object`);
      } catch (e) {
        console.log(`[PAYMENT-DIRECT] failed: ${e.message}`);
      }
    }

    return res.json({
      ok: true,
      env,
      orderReference: order.reference,
      action: order.action,
      amount: order.amount,
      paymentState: latestPayment?.state || null,
      paymentReference: latestPayment?.reference || null,
      captureId: captureId || null,
      paymentUrl: order?._links?.payment?.href || null,
      order
    });
  } catch (error) {
    console.error('Get order error:', error.message, JSON.stringify(error.details, null, 2));
    return res.status(error.status || 500).json({
      ok: false,
      env,
      message: error.message || 'Unexpected error while retrieving payment.',
      details: error.details || null
    });
  }
});


app.post('/api/orders/:orderRef/payments/:paymentRef/captures', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env, req);
  try {
    const missing = getMissingEnv(env, req);
    if (missing.length) {
      return res.status(400).json({ ok: false, message: 'Missing required environment variables.', missingEnv: missing });
    }

    const { orderRef, paymentRef } = req.params;
    const { amount, currencyCode } = req.body;

    const minorUnits = amountToMinorUnits(amount);
    const currency = normalizeCurrency(currencyCode);

    const capture = await capturePayment(orderRef, paymentRef, minorUnits, currency, cfg);

    // POST /captures returns the payment object (state=CAPTURED).
    // The captureId lives in _embedded['cnp:capture'][n]._links.self.href
    const captureId = (() => {
      const embedded = capture?._embedded?.['cnp:capture'];
      const list = Array.isArray(embedded) ? embedded : (embedded ? [embedded] : []);
      for (const c of list) {
        const h = c?._links?.self?.href;
        if (h) { const m = h.match(/captures\/([^/]+)/); if (m) return m[1]; }
        if (c?.id) return c.id;
      }
      // Fallback: direct self link (some API versions return capture object directly)
      const self = capture?._links?.self?.href;
      if (self) { const m = self.match(/captures\/([^/]+)/); if (m) return m[1]; }
      return capture?.id || null;
    })();

    console.log(`[CAPTURE] ${new Date().toISOString()} | env=${env} | orderRef=${orderRef} | paymentRef=${paymentRef} | captureId=${captureId || '—'} | amount=${minorUnits} ${currency}`);

    return res.json({ ok: true, env, captureId, capture });
  } catch (error) {
    console.error('Capture error:', error.message, JSON.stringify(error.details, null, 2));
    const apiErrors = error.details?.errors || [];
    const isInvalidState = apiErrors.some(e => e.errorCode === 'invalidState');
    const message = isInvalidState
      ? 'Payment is already captured (PURCHASE/SALE auto-captures on payment). Skip this step — go directly to Refund once the capture is settled.'
      : (error.message || 'Unexpected error during capture.');
    return res.status(error.status || 500).json({ ok: false, env, message, details: error.details || null });
  }
});

app.post('/api/orders/:orderRef/payments/:paymentRef/captures/:captureId/refund', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env, req);
  try {
    const missing = getMissingEnv(env, req);
    if (missing.length) {
      return res.status(400).json({ ok: false, message: 'Missing required environment variables.', missingEnv: missing });
    }

    const { orderRef, paymentRef, captureId } = req.params;
    const { amount, currencyCode } = req.body;

    const minorUnits = amountToMinorUnits(amount);
    const currency = normalizeCurrency(currencyCode);

    const payment = await refundCapture(orderRef, paymentRef, captureId, minorUnits, currency, cfg);
    const refundId = extractRefundId(payment);

    console.log(`[REFUND] ${new Date().toISOString()} | env=${env} | orderRef=${orderRef} | captureId=${captureId} | amount=${minorUnits} ${currency} | refundId=${refundId || '—'}`);

    return res.json({ ok: true, env, refundId, payment });
  } catch (error) {
    console.error('Refund error:', error.message, JSON.stringify(error.details, null, 2));
    const apiErrors = error.details?.errors || [];
    const isUnsettled = apiErrors.some(e => e.errorCode === 'notRefundable');
    const message = isUnsettled
      ? 'Capture is not yet settled. N-Genius only allows refunds on settled transactions (end-of-day batch). Try again after settlement, or use the sandbox the next day.'
      : (error.message || 'Unexpected error during refund.');
    return res.status(error.status || 500).json({ ok: false, env, message, details: error.details || null });
  }
});

app.get('/api/orders/:orderRef/payments/:paymentRef/captures/:captureId/refund/:refundId', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env, req);
  try {
    const missing = getMissingEnv(env, req);
    if (missing.length) {
      return res.status(400).json({ ok: false, message: 'Missing required environment variables.', missingEnv: missing });
    }

    const { orderRef, paymentRef, captureId, refundId } = req.params;
    const refund = await getRefund(orderRef, paymentRef, captureId, refundId, cfg);

    return res.json({ ok: true, env, refund });
  } catch (error) {
    console.error('Get refund error:', error.message, JSON.stringify(error.details, null, 2));
    return res.status(error.status || 500).json({ ok: false, env, message: error.message || 'Unexpected error retrieving refund.', details: error.details || null });
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`N-Genius test app running on ${APP_BASE_URL}`);
  for (const env of ['sandbox', 'production']) {
    const cfg = getEnvConfig(env);
    const missing = getMissingEnv(env);
    console.log(`[${env}] baseUrl=${cfg.baseUrl} | apiKey=${cfg.apiKey.length} chars | outletId=${cfg.outletId || '(not set)'}`);
    if (missing.length) console.log(`[${env}] Missing env: ${missing.join(', ')}`);
  }
});
