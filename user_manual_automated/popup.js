// ================================
// Popup Controller (Unified)
// ================================

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  restoreWebhookUrl();
  refreshStatus();
});

// ================================
// Cached DOM elements
// ================================
let startBtn;
let stopBtn;
let pauseBtn;
let screenshotBtn;
let statusEl;
let stepCountEl;
let webhookUrlInput;

let statusInterval = null;

// ================================
// Cache DOM references
// ================================
function cacheElements() {
  startBtn = document.getElementById('btn-start-recording') || document.getElementById('startBtn');
  stopBtn = document.getElementById('btn-stop-recording') || document.getElementById('stopBtn');
  pauseBtn = document.getElementById('btn-pause-recording');
  screenshotBtn = document.getElementById('btn-capture-screenshot');
  statusEl = document.getElementById('status');
  stepCountEl = document.getElementById('stepCount');
  webhookUrlInput = document.getElementById('webhookUrl');
}

// ================================
// Bind UI events
// ================================
function bindEvents() {
  startBtn?.addEventListener('click', startRecording);
  stopBtn?.addEventListener('click', stopRecording);
  pauseBtn?.addEventListener('click', pauseRecording);
  screenshotBtn?.addEventListener('click', captureScreenshot);

  webhookUrlInput?.addEventListener('change', saveWebhookUrl);
}

// ================================
// UI Update
// ================================
function updateUI({ isRecording, stepCount = 0 }) {
  if (!statusEl || !stepCountEl) return;

  if (isRecording) {
    statusEl.textContent = '🔴 Recording';
    statusEl.className = 'value recording';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    stepCountEl.textContent = stepCount;
  } else {
    statusEl.textContent = 'Idle';
    statusEl.className = 'value idle';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    stepCountEl.textContent = '0';
  }
}

// ================================
// Status polling
// ================================
function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    updateUI(response);
  });
}

// ================================
// Recording Controls
// ================================
function startRecording() {
  chrome.runtime.sendMessage({ type: 'START_RECORDING' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      alert('Failed to start recording');
      return;
    }

    refreshStatus();
    startPolling();
  });
}

function stopRecording() {
  const webhookUrl = webhookUrlInput?.value.trim() || null;

  chrome.runtime.sendMessage(
    {
      type: 'STOP_RECORDING',
      data: { webhookUrl }
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        alert('Failed to stop recording');
        return;
      }

      stopPolling();
      refreshStatus();
    }
  );
}

// ================================
// Optional / Future Controls
// ================================
/*function pauseRecording() {
  console.log('⏸ Pause recording (TODO)');
  // chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' });
}

function captureScreenshot() {
  console.log('📸 Manual screenshot (TODO)');
  // chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
}
*/
// ================================
// Polling helpers
// ================================
function startPolling() {
  if (statusInterval) return;
  statusInterval = setInterval(refreshStatus, 1000);
}

function stopPolling() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}


