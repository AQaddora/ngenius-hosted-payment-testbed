'use strict';

// ── Storage ──────────────────────────────────────────────────────────────────
const storageKeys = {
  orderReference: 'ngenius:lastOrderReference',
  paymentUrl:     'ngenius:lastPaymentUrl',
  lastResponse:   'ngenius:lastResponse',
  paymentReference: 'ngenius:lastPaymentReference',
  captureId:      'ngenius:lastCaptureId',
  lastRefundId:   'ngenius:lastRefundId'
};
const CREDS_KEY    = 'ngenius:credentials';   // { sandbox: {apiKey,outletId}, production: {apiKey,outletId} }
const HISTORY_KEY  = 'ngenius:orderHistory';
const HISTORY_MAX  = 100;
const PAGE_SIZE    = 10;

// ── Credential helpers ────────────────────────────────────────────────────────
function loadCreds() {
  try { return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}'); } catch { return {}; }
}
function saveCreds(env, apiKey, outletId) {
  const all = loadCreds();
  all[env] = { apiKey, outletId };
  localStorage.setItem(CREDS_KEY, JSON.stringify(all));
}
function clearCreds(env) {
  const all = loadCreds();
  delete all[env];
  localStorage.setItem(CREDS_KEY, JSON.stringify(all));
}
/** Returns headers to attach to every API request so the server can use client creds when env vars are absent */
function getCredHeaders() {
  const creds = loadCreds()[activeEnv] || {};
  const headers = {};
  if (creds.apiKey)   headers['X-NGenius-Api-Key']   = creds.apiKey;
  if (creds.outletId) headers['X-NGenius-Outlet-Id'] = creds.outletId;
  return headers;
}
/** Wrapper so all fetches automatically carry credential headers */
function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...getCredHeaders(), ...(options.headers || {}) }
  });
}

// ── App state ─────────────────────────────────────────────────────────────────
let activeEnv           = 'sandbox';
let paymentPanelRef     = null;   // order ref loaded in payment panel
let currentPanelRef     = null;   // order ref loaded in order details panel
let ordersSource        = 'api';  // 'api' | 'local'
let currentPage         = 0;
let totalOrderPages     = 1;

// ── Utilities ─────────────────────────────────────────────────────────────────
function stateClass(state) {
  return 'state-' + (state || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_');
}
function fmtAmount(amount) {
  if (!amount) return '—';
  return `${(amount.value / 100).toFixed(2)} ${amount.currencyCode}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function short(str, n = 8) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
}
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Local order history ───────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveOrderToHistory(data) {
  if (!data?.orderReference) return;
  const history = loadHistory();
  const idx = history.findIndex(o => o.reference === data.orderReference);
  const entry = {
    reference:        data.orderReference,
    action:           data.action || '—',
    amount:           data.amount || null,
    paymentState:     data.paymentState || null,
    paymentReference: data.paymentReference || null,
    captureId:        data.captureId || null,
    paymentUrl:       data.paymentUrl || null,
    savedAt:          idx >= 0 ? loadHistory()[idx]?.savedAt : new Date().toISOString(),
    updatedAt:        new Date().toISOString()
  };
  if (idx >= 0) history.splice(idx, 1);
  history.unshift(entry);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// ── Config ────────────────────────────────────────────────────────────────────
const modeBadge      = document.getElementById('modeBadge');
const outletValue    = document.getElementById('outletValue');
const serverValue    = document.getElementById('serverValue');
const redirectUrlInput = document.getElementById('redirectUrlInput');

async function loadConfig() {
  try {
    const res  = await apiFetch(`/api/config?env=${activeEnv}`);
    const data = await res.json();
    modeBadge.textContent   = data.mode || 'unknown';
    outletValue.textContent = data.outletIdMasked || '—';
    serverValue.textContent = data.appBaseUrl || '—';
    redirectUrlInput.value  = `${window.location.origin}/result.html`;
    updateCredentialsUI(data.missingEnv || []);
  } catch { modeBadge.textContent = 'Error'; }
}

function updateCredentialsUI(missingEnv) {
  const form   = document.getElementById('credentialsForm');
  const badge  = document.getElementById('authStepBadge');
  const creds  = loadCreds()[activeEnv] || {};

  if (missingEnv.length > 0) {
    form.classList.remove('hidden');
    badge.textContent = 'Setup required';
    badge.style.background = 'rgba(240,160,80,.18)';
    badge.style.color = '#f0c060';
    badge.style.borderColor = 'rgba(240,160,80,.3)';
    // Pre-fill saved creds
    if (creds.apiKey)   document.getElementById('inputApiKey').value   = creds.apiKey;
    if (creds.outletId) document.getElementById('inputOutletId').value = creds.outletId;
    // Auto-open the auth section
    document.getElementById('authSection').open = true;
  } else {
    form.classList.add('hidden');
    badge.textContent = 'Step 0';
    badge.style.cssText = '';
  }
}

// Credentials form buttons
document.getElementById('saveCredsBtn').addEventListener('click', async () => {
  const apiKey   = document.getElementById('inputApiKey').value.trim();
  const outletId = document.getElementById('inputOutletId').value.trim();
  const status   = document.getElementById('credsSaveStatus');
  if (!apiKey || !outletId) {
    status.className = 'summary-box warning'; status.textContent = 'Both fields are required.'; status.classList.remove('hidden'); return;
  }
  saveCreds(activeEnv, apiKey, outletId);
  status.className = 'summary-box success'; status.textContent = 'Credentials saved. Testing connection…'; status.classList.remove('hidden');
  await loadConfig();
  await refreshOrders();
});

document.getElementById('clearCredsBtn').addEventListener('click', () => {
  clearCreds(activeEnv);
  document.getElementById('inputApiKey').value   = '';
  document.getElementById('inputOutletId').value = '';
  const status = document.getElementById('credsSaveStatus');
  status.className = 'summary-box muted'; status.textContent = 'Credentials cleared.'; status.classList.remove('hidden');
  loadConfig();
});

// ── Environment ───────────────────────────────────────────────────────────────
function setActiveEnv(env) {
  activeEnv = env;
  document.getElementById('envSandboxBtn').classList.toggle('active', env === 'sandbox');
  document.getElementById('envProductionBtn').classList.toggle('active', env === 'production');
  currentPage = 0;
  loadConfig();
  refreshOrders();
}
document.getElementById('envSandboxBtn').addEventListener('click', () => setActiveEnv('sandbox'));
document.getElementById('envProductionBtn').addEventListener('click', () => setActiveEnv('production'));

// ── Payment panel ─────────────────────────────────────────────────────────────
function setPanelStatus(text, state = '') {
  const bar = document.getElementById('panelStatusBar');
  bar.className = `panel-status-bar${state ? ' ' + state : ''}`;
  bar.textContent = text;
}

function openPaymentPanel(url, orderRef) {
  paymentPanelRef = orderRef || null;
  const iframe = document.getElementById('paymentIframe');
  setPanelStatus('Loading payment page…', 'loading');
  iframe.src = url;
  document.getElementById('paymentPanel').classList.add('open');
  document.getElementById('paymentOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePaymentPanel() {
  document.getElementById('paymentPanel').classList.remove('open');
  document.getElementById('paymentOverlay').classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { document.getElementById('paymentIframe').src = ''; }, 320);
}

document.getElementById('paymentOverlay').addEventListener('click', closePaymentPanel);
document.getElementById('closePanelBtn').addEventListener('click', closePaymentPanel);

document.getElementById('checkStatusPanelBtn').addEventListener('click', async () => {
  const ref = paymentPanelRef;
  closePaymentPanel();
  if (!ref) return;
  await new Promise(r => setTimeout(r, 350));
  openOrderPanel(ref);
});

document.getElementById('paymentIframe').addEventListener('load', async () => {
  const iframe = document.getElementById('paymentIframe');
  if (!iframe.src || iframe.src === window.location.href) return;
  try {
    const href = iframe.contentWindow.location.href;
    if (!href || href === 'about:blank') return;
    const url          = new URL(href);
    const isSameOrigin = url.origin === window.location.origin;
    const isExampleCom = url.hostname === 'example.com';
    if (isSameOrigin || isExampleCom) {
      const ref = (isSameOrigin && new URLSearchParams(url.search).get('ref'))
        || paymentPanelRef;
      closePaymentPanel();
      if (ref) {
        await new Promise(r => setTimeout(r, 400));
        currentPage = 0;
        await refreshOrders();
        openOrderPanel(ref);
      }
    } else {
      setPanelStatus('Payment page ready', 'ready');
    }
  } catch {
    setPanelStatus('Payment page ready', 'ready');
  }
});

// ── Order details panel ───────────────────────────────────────────────────────
function openOrderPanel(orderRef) {
  currentPanelRef = orderRef;
  document.getElementById('orderPanelRef').textContent = short(orderRef, 16);
  document.getElementById('orderPanelBar').className = 'panel-status-bar loading';
  document.getElementById('orderPanelBar').textContent = 'Loading…';
  document.getElementById('orderPanelBody').innerHTML = '<div class="op-placeholder">Loading order…</div>';
  document.getElementById('orderPanel').classList.add('open');
  document.getElementById('orderOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  // Highlight row
  document.querySelectorAll('#ordersTableBody tr.row-active').forEach(r => r.classList.remove('row-active'));
  const row = document.querySelector(`#ordersTableBody tr[data-ref]`);
  document.querySelectorAll(`#ordersTableBody tr[data-ref="${CSS.escape(orderRef)}"]`).forEach(r => r.classList.add('row-active'));
  loadAndRenderOrderPanel(orderRef);
}

function closeOrderPanel() {
  document.getElementById('orderPanel').classList.remove('open');
  document.getElementById('orderOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.querySelectorAll('#ordersTableBody tr.row-active').forEach(r => r.classList.remove('row-active'));
  currentPanelRef = null;
}

document.getElementById('orderOverlay').addEventListener('click', closeOrderPanel);
document.getElementById('closeOrderPanelBtn').addEventListener('click', closeOrderPanel);
document.getElementById('refreshOrderPanelBtn').addEventListener('click', () => {
  if (currentPanelRef) loadAndRenderOrderPanel(currentPanelRef);
});

async function loadAndRenderOrderPanel(orderRef) {
  const bar  = document.getElementById('orderPanelBar');
  const body = document.getElementById('orderPanelBody');
  bar.className   = 'panel-status-bar loading';
  bar.textContent = 'Loading…';

  try {
    const res  = await apiFetch(`/api/orders/${encodeURIComponent(orderRef)}?env=${activeEnv}`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to load order.');

    saveOrderToHistory(data);
    if (data.paymentReference) localStorage.setItem(storageKeys.paymentReference, data.paymentReference);
    if (data.captureId)        localStorage.setItem(storageKeys.captureId, data.captureId);

    renderOrderPanel(data);
    bar.textContent = data.paymentState || 'UNKNOWN';
    bar.className   = 'panel-status-bar ready';

    // Update state badge in table row if visible
    document.querySelectorAll(`#ordersTableBody tr[data-ref="${CSS.escape(orderRef)}"] .state-badge`).forEach(el => {
      if (data.paymentState) {
        el.className = `state-badge ${stateClass(data.paymentState)}`;
        el.textContent = data.paymentState;
      }
    });
  } catch (err) {
    bar.textContent = err.message;
    bar.className   = 'panel-status-bar';
    body.innerHTML  = `<div class="op-placeholder">${esc(err.message)}</div>`;
  }
}

function renderOrderPanel(data) {
  const body     = document.getElementById('orderPanelBody');
  const major    = data.amount?.value ? (data.amount.value / 100).toFixed(2) : null;
  const currency = data.amount?.currencyCode || '';
  const state    = data.paymentState || 'UNKNOWN';

  const canCapture = state === 'AUTHORISED';
  const canRefund  = ['PURCHASED', 'CAPTURED', 'PARTIALLY_REFUNDED'].includes(state);

  // ── Info section ──────────────────────────────────────
  let html = `<div class="op-section">
    <div class="op-info-grid">
      <div class="op-info-item full"><span>Reference</span><strong>${esc(data.orderReference)}</strong></div>
      <div class="op-info-item"><span>State</span><span class="state-badge ${stateClass(state)}">${esc(state)}</span></div>
      <div class="op-info-item"><span>Action</span><strong>${esc(data.action || '—')}</strong></div>
      <div class="op-info-item"><span>Amount</span><strong>${esc(fmtAmount(data.amount))}</strong></div>
      ${data.paymentReference ? `<div class="op-info-item full"><span>Payment Ref</span><strong class="op-mono">${esc(data.paymentReference)}</strong></div>` : ''}
      ${data.captureId ? `<div class="op-info-item full"><span>Capture ID</span><strong class="op-mono">${esc(data.captureId)}</strong></div>` : ''}
    </div>
  </div>`;

  // ── Open payment page ──────────────────────────────────
  if (data.paymentUrl) {
    const isPending = !data.paymentState || ['STARTED', 'AWAIT_3DS'].includes(data.paymentState);
    html += `<div class="op-section">
      <div class="op-section-title">${isPending ? 'Complete Payment' : 'Payment Page'}</div>
      ${isPending ? `<p style="font-size:12px;color:var(--muted-dim);margin:0 0 10px">Payment not yet completed — open the hosted page to pay.</p>` : ''}
      <button type="button" id="opOpenPayBtn" style="width:100%">${isPending ? 'Open payment page ↗' : 'Reopen payment page'}</button>
    </div>`;
  }

  // ── Capture ────────────────────────────────────────────
  if (canCapture && data.paymentReference) {
    html += `<div class="op-section">
      <div class="op-section-title">Capture Payment</div>
      <p style="font-size:12px;color:var(--muted-dim);margin:0 0 12px">AUTH order — funds are held. Capture to settle.</p>
      <div class="op-form-row">
        <label style="flex:1"><span>Amount</span><input type="number" id="opCaptureAmount" value="${esc(major || '')}" min="0.01" step="0.01" /></label>
        <label style="width:88px"><span>Currency</span><input type="text" id="opCaptureCurrency" value="${esc(currency)}" maxlength="3" /></label>
      </div>
      <div class="op-action-row">
        <button type="button" id="opCaptureBtn">Capture</button>
      </div>
      <div id="opCaptureStatus" class="summary-box muted hidden" style="margin-top:10px"></div>
    </div>`;
  }

  // ── Refund ─────────────────────────────────────────────
  if (canRefund) {
    if (data.captureId && data.paymentReference) {
      html += `<div class="op-section">
        <div class="op-section-title">Refund</div>
        <div class="op-form-row">
          <label style="flex:1"><span>Amount</span><input type="number" id="opRefundAmount" value="${esc(major || '')}" min="0.01" step="0.01" /></label>
          <label style="width:88px"><span>Currency</span><input type="text" id="opRefundCurrency" value="${esc(currency)}" maxlength="3" /></label>
        </div>
        <div class="op-action-row">
          <button type="button" id="opRefundBtn">Refund</button>
        </div>
        <div id="opRefundStatus" class="summary-box muted hidden" style="margin-top:10px"></div>
      </div>`;
    } else {
      html += `<div class="op-section">
        <div class="op-section-title">Refund</div>
        <div class="summary-box warning" style="margin:0">Capture ID not found yet — refresh after the capture settles.</div>
      </div>`;
    }
  }

  // ── Get refund status ──────────────────────────────────
  const storedRefundId = localStorage.getItem(storageKeys.lastRefundId);
  if (data.captureId && data.paymentReference && (data.paymentState === 'REFUNDED' || data.paymentState === 'PARTIALLY_REFUNDED' || storedRefundId)) {
    html += `<div class="op-section">
      <div class="op-section-title">Refund Status</div>
      <div class="op-form-row">
        <label style="flex:1"><span>Refund ID</span><input type="text" id="opRefundId" value="${esc(storedRefundId || '')}" placeholder="Paste refund ID…" /></label>
      </div>
      <div class="op-action-row">
        <button type="button" id="opGetRefundBtn" class="secondary">Check status</button>
      </div>
      <pre id="opRefundOutput" class="json-output hidden"></pre>
    </div>`;
  }

  // ── Raw response ───────────────────────────────────────
  html += `<div class="op-section">
    <details>
      <summary style="cursor:pointer;font-size:12px;color:var(--muted-dim);user-select:none;list-style:none">▸ Raw response</summary>
      <pre class="json-output" style="margin-top:8px;max-height:260px">${esc(JSON.stringify(data, null, 2))}</pre>
    </details>
  </div>`;

  body.innerHTML = html;
  wireOrderPanelButtons(data);
}

function wireOrderPanelButtons(data) {
  const major    = data.amount?.value ? (data.amount.value / 100).toFixed(2) : '';
  const currency = data.amount?.currencyCode || '';

  // Open payment page
  const opOpenPayBtn = document.getElementById('opOpenPayBtn');
  if (opOpenPayBtn) {
    opOpenPayBtn.addEventListener('click', () => {
      closeOrderPanel();
      setTimeout(() => openPaymentPanel(data.paymentUrl, data.orderReference), 120);
    });
  }

  // Capture
  const opCaptureBtn = document.getElementById('opCaptureBtn');
  if (opCaptureBtn) {
    opCaptureBtn.addEventListener('click', async () => {
      const statusEl = document.getElementById('opCaptureStatus');
      const amount   = document.getElementById('opCaptureAmount').value;
      const curr     = document.getElementById('opCaptureCurrency').value.trim();
      opCaptureBtn.disabled = true;
      opCaptureBtn.textContent = 'Capturing…';
      statusEl.className = 'summary-box muted';
      statusEl.textContent = 'Sending capture request…';
      statusEl.classList.remove('hidden');
      try {
        const res  = await apiFetch(
          `/api/orders/${encodeURIComponent(data.orderReference)}/payments/${encodeURIComponent(data.paymentReference)}/captures?env=${activeEnv}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, currencyCode: curr }) }
        );
        const resp = await res.json();
        if (!res.ok || !resp.ok) throw new Error(resp.message || 'Capture failed.');
        statusEl.className   = 'summary-box success';
        statusEl.textContent = `Captured. ID: ${resp.captureId || '(see raw response)'}`;
        if (resp.captureId) localStorage.setItem(storageKeys.captureId, resp.captureId);
        setTimeout(() => loadAndRenderOrderPanel(data.orderReference), 600);
      } catch (err) {
        statusEl.className   = 'summary-box error';
        statusEl.textContent = err.message;
        opCaptureBtn.disabled = false;
        opCaptureBtn.textContent = 'Capture';
      }
    });
  }

  // Refund
  const opRefundBtn = document.getElementById('opRefundBtn');
  if (opRefundBtn) {
    opRefundBtn.addEventListener('click', async () => {
      const statusEl = document.getElementById('opRefundStatus');
      const amount   = document.getElementById('opRefundAmount').value;
      const curr     = document.getElementById('opRefundCurrency').value.trim();
      opRefundBtn.disabled = true;
      opRefundBtn.textContent = 'Refunding…';
      statusEl.className = 'summary-box muted';
      statusEl.textContent = 'Sending refund request…';
      statusEl.classList.remove('hidden');
      try {
        const res  = await apiFetch(
          `/api/orders/${encodeURIComponent(data.orderReference)}/payments/${encodeURIComponent(data.paymentReference)}/captures/${encodeURIComponent(data.captureId)}/refund?env=${activeEnv}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, currencyCode: curr }) }
        );
        const resp = await res.json();
        if (!res.ok || !resp.ok) throw new Error(resp.message || 'Refund failed.');
        statusEl.className   = 'summary-box success';
        statusEl.textContent = `Refund submitted. ID: ${resp.refundId || '(see raw response)'}`;
        if (resp.refundId) localStorage.setItem(storageKeys.lastRefundId, resp.refundId);
        setTimeout(() => loadAndRenderOrderPanel(data.orderReference), 600);
      } catch (err) {
        statusEl.className   = 'summary-box error';
        statusEl.textContent = err.message;
        opRefundBtn.disabled = false;
        opRefundBtn.textContent = 'Refund';
      }
    });
  }

  // Get refund
  const opGetRefundBtn = document.getElementById('opGetRefundBtn');
  if (opGetRefundBtn) {
    opGetRefundBtn.addEventListener('click', async () => {
      const refundId = document.getElementById('opRefundId').value.trim();
      const output   = document.getElementById('opRefundOutput');
      if (!refundId) { output.textContent = 'Enter a refund ID.'; output.classList.remove('hidden'); return; }
      opGetRefundBtn.disabled = true;
      opGetRefundBtn.textContent = 'Fetching…';
      try {
        const res  = await apiFetch(
          `/api/orders/${encodeURIComponent(data.orderReference)}/payments/${encodeURIComponent(data.paymentReference)}/captures/${encodeURIComponent(data.captureId)}/refund/${encodeURIComponent(refundId)}?env=${activeEnv}`
        );
        const resp = await res.json();
        output.textContent = JSON.stringify(resp, null, 2);
        output.classList.remove('hidden');
      } catch (err) {
        output.textContent = `Error: ${err.message}`;
        output.classList.remove('hidden');
      } finally {
        opGetRefundBtn.disabled = false;
        opGetRefundBtn.textContent = 'Check status';
      }
    });
  }
}

// ── Orders table ──────────────────────────────────────────────────────────────
function renderOrdersTable(orders) {
  const tbody      = document.getElementById('ordersTableBody');
  const pagination = document.getElementById('ordersPagination');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No orders found.</td></tr>';
    pagination.style.display = 'none';
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const ref        = o.reference || '';
    const state      = o.paymentState || '—';
    const date       = fmtDate(o.createDateTime || o.updatedAt || o.savedAt);
    const incomplete = !o.paymentState || ['STARTED', 'AWAIT_3DS'].includes(o.paymentState);
    const payBtn     = (incomplete && o.paymentUrl)
      ? `<button type="button" class="op-pay-btn" data-url="${esc(o.paymentUrl)}" data-ref="${esc(ref)}" style="padding:5px 12px;font-size:12px">Pay ↗</button>`
      : '';
    return `<tr class="order-row" data-ref="${esc(ref)}">
      <td style="white-space:nowrap;font-size:12px;color:var(--muted-dim)">${date}</td>
      <td><code title="${esc(ref)}">${short(ref, 13)}</code></td>
      <td style="font-size:12px;font-weight:600">${esc(o.action || '—')}</td>
      <td style="white-space:nowrap">${fmtAmount(o.amount)}</td>
      <td><span class="state-badge ${stateClass(state)}">${esc(state)}</span></td>
      <td style="text-align:right;white-space:nowrap;display:flex;gap:6px;justify-content:flex-end">${payBtn}<button type="button" class="secondary op-details-btn" data-ref="${esc(ref)}" style="padding:5px 12px;font-size:12px">Details →</button></td>
    </tr>`;
  }).join('');

  // Row click
  tbody.querySelectorAll('.order-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.op-details-btn') || e.target.closest('.op-pay-btn')) return;
      openOrderPanel(row.dataset.ref);
    });
  });
  tbody.querySelectorAll('.op-details-btn').forEach(btn => {
    btn.addEventListener('click', () => openOrderPanel(btn.dataset.ref));
  });
  tbody.querySelectorAll('.op-pay-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openPaymentPanel(btn.dataset.url, btn.dataset.ref);
    });
  });

  // Pagination controls
  const pageLabel = document.getElementById('ordersPageLabel');
  const prevBtn   = document.getElementById('ordersPrevBtn');
  const nextBtn   = document.getElementById('ordersNextBtn');
  pageLabel.textContent = `Page ${currentPage + 1} of ${totalOrderPages}`;
  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage >= totalOrderPages - 1;
  pagination.style.display = totalOrderPages > 1 ? 'flex' : 'none';
}

async function fetchApiOrders() {
  const tbody = document.getElementById('ordersTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Loading…</td></tr>';
  document.getElementById('ordersPagination').style.display = 'none';
  try {
    const res  = await apiFetch(`/api/orders?env=${activeEnv}&page=${currentPage}&pageSize=${PAGE_SIZE}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch orders.');
    const p = data.page || {};
    totalOrderPages = p.totalPages || Math.ceil((p.totalElements || 0) / PAGE_SIZE) || 1;
    renderOrdersTable(data.orders || []);
  } catch (err) {
    // API unavailable (e.g. 405 on production) — fall back to local history
    const history = loadHistory();
    if (history.length > 0) {
      totalOrderPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
      if (currentPage >= totalOrderPages) currentPage = totalOrderPages - 1;
      renderOrdersTable(history.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE));
      // Prepend a subtle note row
      tbody.insertAdjacentHTML('afterbegin',
        `<tr><td colspan="6" style="padding:5px 12px;font-size:11px;color:var(--muted-dim);border-bottom:1px solid var(--line)">` +
        `API unavailable (${esc(err.message)}) — showing local history</td></tr>`);
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${esc(err.message)}</td></tr>`;
      document.getElementById('ordersPagination').style.display = 'none';
    }
  }
}

function fetchLocalOrders() {
  const history = loadHistory();
  totalOrderPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  if (currentPage >= totalOrderPages) currentPage = totalOrderPages - 1;
  renderOrdersTable(history.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE));
}

async function refreshOrders() {
  if (ordersSource === 'api') await fetchApiOrders();
  else fetchLocalOrders();
}

// Source toggle
document.getElementById('srcApiBtn').addEventListener('click', () => {
  ordersSource = 'api'; currentPage = 0;
  document.getElementById('srcApiBtn').classList.add('active');
  document.getElementById('srcLocalBtn').classList.remove('active');
  refreshOrders();
});
document.getElementById('srcLocalBtn').addEventListener('click', () => {
  ordersSource = 'local'; currentPage = 0;
  document.getElementById('srcApiBtn').classList.remove('active');
  document.getElementById('srcLocalBtn').classList.add('active');
  refreshOrders();
});

// Pagination
document.getElementById('ordersPrevBtn').addEventListener('click', () => { currentPage--; refreshOrders(); });
document.getElementById('ordersNextBtn').addEventListener('click', () => { currentPage++; refreshOrders(); });

// Refresh
document.getElementById('refreshOrdersBtn').addEventListener('click', () => { currentPage = 0; refreshOrders(); });

// Search / find
document.getElementById('orderSearchBtn').addEventListener('click', () => {
  const ref = document.getElementById('orderSearchInput').value.trim();
  if (ref) openOrderPanel(ref);
});
document.getElementById('orderSearchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const ref = e.target.value.trim();
    if (ref) openOrderPanel(ref);
  }
});

// ── New Order form ─────────────────────────────────────────────────────────────
document.getElementById('newOrderToggleBtn').addEventListener('click', () => {
  document.getElementById('newOrderForm').classList.toggle('hidden');
});
document.getElementById('cancelNewOrderBtn').addEventListener('click', () => {
  document.getElementById('newOrderForm').classList.add('hidden');
});
document.getElementById('openLastPaymentBtn').addEventListener('click', () => {
  const url = localStorage.getItem(storageKeys.paymentUrl);
  const ref = localStorage.getItem(storageKeys.orderReference);
  if (!url) { alert('No stored payment URL yet. Create an order first.'); return; }
  openPaymentPanel(url, ref);
});

document.getElementById('paymentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn     = document.getElementById('createBtn');
  const createSummary = document.getElementById('createSummary');
  submitBtn.disabled  = true;
  submitBtn.textContent = 'Creating…';
  createSummary.className = 'summary-box muted';
  createSummary.textContent = 'Creating order…';
  createSummary.classList.remove('hidden');

  try {
    const payload = Object.fromEntries(new FormData(document.getElementById('paymentForm')).entries());
    const res     = await apiFetch(`/api/create-payment?env=${activeEnv}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to create payment.');

    localStorage.setItem(storageKeys.orderReference, data.orderReference || '');
    localStorage.setItem(storageKeys.paymentUrl, data.paymentUrl || '');
    localStorage.setItem(storageKeys.lastResponse, JSON.stringify(data));
    saveOrderToHistory(data);

    createSummary.className   = 'summary-box success';
    createSummary.textContent = `Order created. State: ${data.paymentState || 'unknown'}`;

    currentPage = 0;
    await refreshOrders();

    if (document.getElementById('autoRedirect').checked && data.paymentUrl) {
      document.getElementById('newOrderForm').classList.add('hidden');
      openPaymentPanel(data.paymentUrl, data.orderReference);
    }
  } catch (error) {
    createSummary.className   = 'summary-box error';
    createSummary.textContent = error.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create & Pay';
  }
});

// ── Test Auth ─────────────────────────────────────────────────────────────────
document.getElementById('testAuthBtn').addEventListener('click', async () => {
  const btn       = document.getElementById('testAuthBtn');
  const resultBox = document.getElementById('authResult');
  const outputBox = document.getElementById('authOutput');
  btn.disabled    = true;
  btn.textContent = 'Testing…';
  try {
    const res  = await apiFetch(`/api/test-auth?env=${activeEnv}`);
    const data = await res.json();
    outputBox.textContent = JSON.stringify(data, null, 2);
    outputBox.classList.remove('hidden');
    if (data.ok) {
      document.getElementById('authStatus').textContent  = 'Success ✓';
      document.getElementById('authStatus').style.color  = '#22c55e';
      document.getElementById('authName').textContent    = data.accountName || '—';
      document.getElementById('authRealm').textContent   = data.realm || '—';
      document.getElementById('authType').textContent    = data.accountType || '—';
      document.getElementById('authExpiry').textContent  = data.expiresIn ? new Date(data.expiresIn).toLocaleTimeString() : '—';
      document.getElementById('authMode').textContent    = data.mode || '—';
      document.getElementById('authToken').value         = data.fullToken || '';
      resultBox.classList.remove('hidden');
    } else {
      document.getElementById('authStatus').textContent = `Failed: ${data.message}`;
      document.getElementById('authStatus').style.color = '#ef4444';
      resultBox.classList.remove('hidden');
    }
  } catch (error) {
    outputBox.textContent = `Error: ${error.message}`;
    outputBox.classList.remove('hidden');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Test Authentication';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  await loadConfig();
  refreshOrders();
}());
