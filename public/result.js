const output = document.getElementById('resultOutput');
const summary = document.getElementById('resultSummary');
const refInput = document.getElementById('resultOrderRef');
const storageKey = 'ngenius:lastOrderReference';

let timer = null;

function setOutput(value) {
  output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function setSummary(message, tone = 'muted') {
  summary.className = `summary-box ${tone}`;
  summary.textContent = message;
}

function getReference() {
  const params = new URLSearchParams(window.location.search);
  return params.get('ref') || localStorage.getItem(storageKey) || '';
}

async function checkStatus() {
  const reference = refInput.value.trim();
  if (!reference) {
    setSummary('No order reference available yet.', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(reference)}`);
    const data = await res.json();
    setOutput(data);

    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Failed to fetch order.');
    }

    const state = data.paymentState || 'unknown';
    setSummary(`Payment state: ${state}`, state.includes('DECLIN') ? 'error' : 'success');
  } catch (error) {
    setSummary(error.message, 'error');
  }
}

document.getElementById('checkNowBtn').addEventListener('click', checkStatus);

document.getElementById('autoPollBtn').addEventListener('click', (event) => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    event.target.textContent = 'Start auto refresh';
    return;
  }

  checkStatus();
  timer = setInterval(checkStatus, 5000);
  event.target.textContent = 'Stop auto refresh';
});

(function init() {
  const ref = getReference();
  refInput.value = ref;
  setOutput('Ready.');
  if (ref) {
    checkStatus();
  }
})();
