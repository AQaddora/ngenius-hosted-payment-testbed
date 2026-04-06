require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function getEnvConfig(env) {
  if (env === 'production') {
    return {
      baseUrl: (process.env.NGENIUS_PROD_BASE_URL || 'https://api-gateway.ngenius-payments.com').replace(/\/$/, ''),
      apiKey: process.env.NGENIUS_PROD_API_KEY || '',
      outletId: process.env.NGENIUS_PROD_OUTLET_ID || ''
    };
  }
  return {
    baseUrl: (process.env.NGENIUS_BASE_URL || 'https://api-gateway.sandbox.ngenius-payments.com').replace(/\/$/, ''),
    apiKey: process.env.NGENIUS_API_KEY || '',
    outletId: process.env.NGENIUS_OUTLET_ID || ''
  };
}

function getMissingEnv(env) {
  const cfg = getEnvConfig(env);
  const missing = [];
  if (!cfg.apiKey) missing.push(env === 'production' ? 'NGENIUS_PROD_API_KEY' : 'NGENIUS_API_KEY');
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
  const cfg = getEnvConfig(env);
  try {
    const missing = getMissingEnv(env);
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
  const cfg = getEnvConfig(env);
  res.json({
    ok: true,
    env,
    appBaseUrl: APP_BASE_URL,
    ngeniusBaseUrl: cfg.baseUrl,
    mode: cfg.baseUrl.includes('sandbox') ? 'sandbox' : 'live',
    outletIdMasked: maskValue(cfg.outletId),
    apiKeyMasked: maskValue(cfg.apiKey, 6, 4),
    missingEnv: getMissingEnv(env)
  });
});

app.post('/api/create-payment', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env);
  try {
    const missing = getMissingEnv(env);
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

app.get('/api/orders/:reference', async (req, res) => {
  const env = req.query.env === 'production' ? 'production' : 'sandbox';
  const cfg = getEnvConfig(env);
  try {
    const missing = getMissingEnv(env);
    if (missing.length) {
      return res.status(400).json({
        ok: false,
        message: 'Missing required environment variables.',
        missingEnv: missing
      });
    }

    const order = await getOrder(req.params.reference, cfg);
    const latestPayment = getLatestPayment(order);

    return res.json({
      ok: true,
      env,
      orderReference: order.reference,
      action: order.action,
      amount: order.amount,
      paymentState: latestPayment?.state || null,
      paymentReference: latestPayment?.reference || null,
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
