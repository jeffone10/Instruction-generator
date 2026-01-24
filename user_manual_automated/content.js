
console.log('🔧 Content script loading...');

// Notify background that content script is ready
try {
  const port = chrome.runtime.connect({ name: 'content-ready' });
  console.log('✅ Connected to background script');
  
  port.onMessage.addListener((message) => {
    console.log('📨 Port message received:', message.type);
    if (message.type === 'START_RECORDING') {
      startRecording();
    } else if (message.type === 'STOP_RECORDING') {
      stopRecording();
    }
  });
} catch (error) {
  console.error('❌ Failed to connect to background:', error);
}

// Recording state
let isRecording = false;

// Event listeners storage
let eventListeners = [];

// NEW: Debounce timers for input events
let inputDebounceTimers = {};
const INPUT_DEBOUNCE_MS = 1000;

/**
 * Generates a unique event ID
 */
function generateEventId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `event_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Extract readable label from element
 * ENHANCED: Better fallback chain to avoid "Unknown element"
 */
function extractElementLabel(element) {
  if (!element) return 'Unknown element';

  // Try innerText first (visible text)
  if (element.innerText?.trim()) {
    const t = element.innerText.trim();
    return t.length > 100 ? t.slice(0, 100) + '...' : t;
  }

  // Try aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // Try placeholder
  if (element.placeholder?.trim()) return `Input: ${element.placeholder.trim()}`;

  // Try name attribute
  if (element.name?.trim()) return `Field: ${element.name.trim()}`;

  // Try id
  if (element.id?.trim()) return `#${element.id.trim()}`;

  // Try alt for images
  if (element.tagName === 'IMG' && element.alt?.trim()) {
    return `Image: ${element.alt.trim()}`;
  }

  // Try parent button/link
  const parentButton = element.closest('button, a');
  if (parentButton?.innerText?.trim()) {
    const text = parentButton.innerText.trim();
    return text.length > 100 ? text.slice(0, 100) + '...' : text;
  }

  // Try data attributes
  const dataLabel = element.getAttribute('data-label') || 
                    element.getAttribute('data-testid');
  if (dataLabel?.trim()) return dataLabel.trim();

  // Last resort: tag name with class
  const className = element.className && typeof element.className === 'string' 
    ? `.${element.className.split(' ')[0]}` 
    : '';
  return `${element.tagName.toLowerCase()}${className}`;
}

/**
 * Build step object
 */
function buildStepObject(action, element) {
  return {
    eventId: generateEventId(),
    action,
    label: extractElementLabel(element),
    timestamp: Date.now(),
    url: window.location.href,
    elementType: element?.tagName?.toLowerCase() || 'unknown',
  };
}

/**
 * Send step to background
 */
function sendStepToBackground(step) {
  console.log('📤 Sending step to background:', step.action, step.label?.substring(0, 30));
  
  chrome.runtime.sendMessage(
    {
      type: 'NEW_STEP',
      payload: step
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Message failed:', chrome.runtime.lastError);
      } else {
        console.log('✅ Step confirmed by background:', step.action);
      }
    }
  );
}

/**
 * Event handlers
 */
function handleClick(e) {
  if (!isRecording) return;
  
  console.log('🖱️ Click detected on:', e.target.tagName);
  
  const step = buildStepObject('click', e.target);
  sendStepToBackground(step);
}

function handleInput(e) {
  if (!isRecording) return;
  
  console.log('⌨️ Input detected on:', e.target.tagName);
  
  // NEW: Debounce input events - only send after user stops typing
  const elementId = e.target.id || e.target.name || 'input';
  
  if (inputDebounceTimers[elementId]) {
    clearTimeout(inputDebounceTimers[elementId]);
  }
  
  inputDebounceTimers[elementId] = setTimeout(() => {
    const step = buildStepObject('input', e.target);
    sendStepToBackground(step);
    delete inputDebounceTimers[elementId];
  }, INPUT_DEBOUNCE_MS);
}

function handleKeydown(e) {
  if (!isRecording || e.key !== 'Enter') return;
  
  console.log('↩️ Enter key detected');
  
  const step = buildStepObject('submit', e.target);
  sendStepToBackground(step);
}

// NEW: Handle select/checkbox/radio changes
function handleChange(e) {
  if (!isRecording) return;
  
  console.log('🔄 Change detected on:', e.target.tagName, e.target.type);
  
  if (e.target.tagName === 'SELECT') {
    const step = buildStepObject('select', e.target);
    sendStepToBackground(step);
  } else if (e.target.type === 'checkbox' || e.target.type === 'radio') {
    const step = buildStepObject('toggle', e.target);
    sendStepToBackground(step);
  }
}

/**
 * Attach listeners
 */
function attachEventListeners() {
  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('change', handleChange, true); // NEW

  eventListeners = ['click', 'input', 'keydown', 'change'];
  console.log('🎥 Recording started');
}

/**
 * Remove listeners
 */
function removeEventListeners() {
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('keydown', handleKeydown, true);
  document.removeEventListener('change', handleChange, true); // NEW
  
  // Clear all debounce timers
  Object.values(inputDebounceTimers).forEach(timer => clearTimeout(timer));
  inputDebounceTimers = {};
  
  eventListeners = [];
  console.log('⏹️ Recording stopped');
}

/**
 * Recording controls
 */
function startRecording() {
  if (isRecording) {
    console.log('⚠️ Already recording');
    return;
  }
  isRecording = true;
  attachEventListeners();
  console.log('🎥 Content script: Recording STARTED');
}

function stopRecording() {
  if (!isRecording) {
    console.log('⚠️ Not recording');
    return;
  }
  isRecording = false;
  removeEventListeners();
  console.log('⏹️ Content script: Recording STOPPED');
}

// Listen from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('📬 Runtime message received:', msg.type);
  
  if (msg.type === 'PING') {
    console.log('🏓 PING received, responding...');
    sendResponse({ success: true, ready: true });
    return true;
  }
  
  if (msg.type === 'START_RECORDING') {
    console.log('🎬 START_RECORDING command received');
    startRecording();
  }
  if (msg.type === 'STOP_RECORDING') {
    console.log('🛑 STOP_RECORDING command received');
    stopRecording();
  }
  
  sendResponse({ success: true });
  return true;
});

console.log('✅ Content script initialized and ready');