const storageKeys = {
  orderReference: 'ngenius:lastOrderReference',
  paymentUrl: 'ngenius:lastPaymentUrl',
  lastResponse: 'ngenius:lastResponse'
};

let activeEnv = 'sandbox';

function setActiveEnv(env) {
  activeEnv = env;
  document.getElementById('envSandboxBtn').classList.toggle('active', env === 'sandbox');
  document.getElementById('envProductionBtn').classList.toggle('active', env === 'production');
  loadConfig();
}

function showOrderResultBanner(data) {
  const banner = document.getElementById('orderResultBanner');
  const refEl = document.getElementById('resultOrderRef');
  const stateEl = document.getElementById('resultPayState');
  const linkEl = document.getElementById('resultPayLink');

  refEl.textContent = data.orderReference || '—';
  stateEl.textContent = data.paymentState || 'unknown';
  banner.classList.remove('hidden');

  if (data.paymentUrl) {
    linkEl.href = data.paymentUrl;
    linkEl.classList.remove('hidden');
  } else {
    linkEl.classList.add('hidden');
  }
}

const apiOutput = document.getElementById('apiOutput');
const statusSummary = document.getElementById('statusSummary');
const paymentForm = document.getElementById('paymentForm');
const statusForm = document.getElementById('statusForm');
const orderReferenceInput = document.getElementById('orderReferenceInput');
const redirectUrlInput = document.getElementById('redirectUrlInput');
const modeBadge = document.getElementById('modeBadge');
const outletValue = document.getElementById('outletValue');
const serverValue = document.getElementById('serverValue');

function setOutput(element, value) {
  element.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function setSummary(message, tone = 'muted') {
  statusSummary.className = `summary-box ${tone}`;
  statusSummary.textContent = message;
}

function saveLastPayment(data) {
  localStorage.setItem(storageKeys.orderReference, data.orderReference || '');
  localStorage.setItem(storageKeys.paymentUrl, data.paymentUrl || '');
  localStorage.setItem(storageKeys.lastResponse, JSON.stringify(data));
}

function loadLastOrderReference() {
  return localStorage.getItem(storageKeys.orderReference) || '';
}

function loadLastPaymentUrl() {
  return localStorage.getItem(storageKeys.paymentUrl) || '';
}

async function loadConfig() {
  const res = await fetch(`/api/config?env=${activeEnv}`);
  const data = await res.json();
  modeBadge.textContent = `${data.mode || 'unknown'}`;
  outletValue.textContent = data.outletIdMasked || '—';
  serverValue.textContent = data.appBaseUrl || '—';
  redirectUrlInput.value = `${window.location.origin}/result.html`;
  if (data.missingEnv?.length) {
    setSummary(`Missing env: ${data.missingEnv.join(', ')}`, 'warning');
  }
}


async function fetchOrder(reference) {
  const res = await fetch(`/api/orders/${encodeURIComponent(reference)}?env=${activeEnv}`);
  const data = await res.json();
  setOutput(apiOutput, data);

  if (!res.ok || !data.ok) {
    throw new Error(data.message || 'Failed to fetch order status.');
  }

  return data;
}

paymentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn = document.getElementById('createBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';

  try {
    const formData = new FormData(paymentForm);
    const payload = Object.fromEntries(formData.entries());

    const res = await fetch(`/api/create-payment?env=${activeEnv}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    setOutput(apiOutput, data);

    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Failed to create payment.');
    }

    saveLastPayment(data);
    orderReferenceInput.value = data.orderReference || '';
    showOrderResultBanner(data);
    setSummary(`Order created. Current payment state: ${data.paymentState || 'unknown'}`, 'success');

    if (document.getElementById('autoRedirect').checked && data.paymentUrl) {
      window.location.href = data.paymentUrl;
    }
  } catch (error) {
    setSummary(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create payment';
  }
});

statusForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const reference = orderReferenceInput.value.trim();
  if (!reference) {
    setSummary('Enter an order reference first.', 'warning');
    return;
  }

  try {
    const data = await fetchOrder(reference);
    const state = data.paymentState || 'unknown';
    setSummary(`Payment state: ${state}`, state.includes('DECLIN') ? 'error' : 'success');
  } catch (error) {
    setSummary(error.message, 'error');
  }
});

document.getElementById('useLastRefBtn').addEventListener('click', () => {
  orderReferenceInput.value = loadLastOrderReference();
});

document.getElementById('openLastPaymentBtn').addEventListener('click', () => {
  const paymentUrl = loadLastPaymentUrl();
  if (!paymentUrl) {
    setSummary('No stored payment URL yet. Create an order first.', 'warning');
    return;
  }
  window.location.href = paymentUrl;
});

document.getElementById('envSandboxBtn').addEventListener('click', () => setActiveEnv('sandbox'));
document.getElementById('envProductionBtn').addEventListener('click', () => setActiveEnv('production'));

document.getElementById('testAuthBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testAuthBtn');
  btn.disabled = true;
  btn.textContent = 'Testing…';

  const resultBox = document.getElementById('authResult');
  const outputBox = document.getElementById('authOutput');

  try {
    const res = await fetch(`/api/test-auth?env=${activeEnv}`);
    const data = await res.json();

    outputBox.textContent = JSON.stringify(data, null, 2);
    outputBox.classList.remove('hidden');

    if (data.ok) {
      document.getElementById('authStatus').textContent = 'Success ✓';
      document.getElementById('authStatus').style.color = 'var(--green, #22c55e)';
      document.getElementById('authName').textContent = data.accountName || '—';
      document.getElementById('authRealm').textContent = data.realm || '—';
      document.getElementById('authType').textContent = data.accountType || '—';
      document.getElementById('authExpiry').textContent = data.expiresIn
        ? new Date(data.expiresIn).toLocaleTimeString()
        : '—';
      document.getElementById('authMode').textContent = data.mode || '—';
      document.getElementById('authToken').value = data.fullToken || '';
      resultBox.classList.remove('hidden');
    } else {
      document.getElementById('authStatus').textContent = `Failed: ${data.message}`;
      document.getElementById('authStatus').style.color = 'var(--red, #ef4444)';
      resultBox.classList.remove('hidden');
    }
  } catch (error) {
    outputBox.textContent = `Error: ${error.message}`;
    outputBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Authentication';
  }
});

(async function init() {
  await loadConfig();
  orderReferenceInput.value = loadLastOrderReference();
  const lastResponse = localStorage.getItem(storageKeys.lastResponse);
  if (lastResponse) {
    try {
      setOutput(apiOutput, JSON.parse(lastResponse));
    } catch {
      setOutput(apiOutput, lastResponse);
    }
  }
})();
