
// ================================
// Session state (in-memory)
// ================================
let isRecording = false;
let sessionId = null;
let steps = [];
let lastScreenshotHash = null;
let pendingStepPromises = new Set();

// ================================
// Utilities
// ================================
function generateSessionId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Generate simple hash for screenshot comparison
 * Prevents duplicate screenshots of the same screen
 */
function simpleHash(str) {
  if (!str) return null;
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 100); i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Capture screenshot using Chrome API with deduplication
 */
async function captureScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || tab.windowId === undefined) {
      console.warn("No active tab for screenshot");
      return null;
    }

    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });

    // Check if screenshot is duplicate
    const hash = simpleHash(screenshot);
    if (hash === lastScreenshotHash) {
      console.log("📸 Duplicate screenshot detected, skipping");
      return null;
    }

    lastScreenshotHash = hash;
    return screenshot;
  } catch (error) {
    console.error("Screenshot capture failed:", error);
    return null;
  }
}

// ================================
// Recording lifecycle
// ================================
async function startRecording() {
  sessionId = generateSessionId();
  steps = [];
  isRecording = true;
  lastScreenshotHash = null;
  pendingStepPromises.clear();

  await chrome.storage.session.set({
    isRecording: true,
    sessionId,
  });

  startKeepAlive();

  console.log("🎬 Recording started:", sessionId);
  
  // Make sure content script is injected in active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && !tab.url?.startsWith('chrome://') && !tab.url?.startsWith('chrome-extension://')) {
      console.log('💉 Ensuring content script is injected in tab:', tab.id);
      
      // Try to ping the content script first
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        console.log('✅ Content script already active');
      } catch (error) {
        // Content script not loaded, inject it
        console.log('⚠️ Content script not found, injecting...');
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        console.log('✅ Content script injected');
        
        // Wait a moment for it to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.error('❌ Failed to inject content script:', error);
  }
  
  return sessionId;
}

async function stopRecording(webhookUrl = null) {
  if (!isRecording) return;

  console.log("⏸️ Stopping recording...");
  console.log(`📊 Current steps before wait: ${steps.length}`);

  // Wait a bit for any pending messages from content script
  await new Promise(resolve => setTimeout(resolve, 500));

  // Wait for all pending screenshot operations
  if (pendingStepPromises.size > 0) {
    console.log(`⏳ Waiting for ${pendingStepPromises.size} pending operations...`);
    await Promise.allSettled([...pendingStepPromises]);
  }

  isRecording = false;
  stopKeepAlive();

  const targetWebhookUrl = webhookUrl || DEFAULT_WEBHOOK_URL;

  const payload = {
    sessionId,
    steps,
    metadata: {
      totalSteps: steps.length,
      stepsWithScreenshots: steps.filter(s => s.screenshot).length,
      endTime: Date.now(),
    }
  };

  console.log("📦 Final session summary:", {
    sessionId,
    totalSteps: steps.length,
    stepsWithScreenshots: steps.filter(s => s.screenshot).length,
    steps: steps.map(s => ({ action: s.action, label: s.label?.substring(0, 30), hasScreenshot: !!s.screenshot }))
  });

  try {
    const response = await fetch(targetWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    console.log("✅ Session sent to webhook successfully");
  } catch (err) {
    console.error("❌ Webhook error:", err);
  }

  await chrome.storage.session.clear();

  sessionId = null;
  steps = [];
  lastScreenshotHash = null;
  pendingStepPromises.clear();
}

// ================================
// Step handling
// ================================
async function addStep(step) {
  if (!isRecording) {
    console.warn("⚠️ Received step but not recording");
    return;
  }

  const stepPromise = (async () => {
    const screenshot = await captureScreenshot();

    const enhancedStep = {
      ...step,
      screenshot: screenshot || null,
      stepNumber: steps.length + 1,
    };

    steps.push(enhancedStep);

    console.log(`✅ Step ${steps.length} added:`, {
      action: step.action,
      label: step.label?.substring(0, 40) || 'No label',
      hasScreenshot: !!screenshot,
    });
  })();

  pendingStepPromises.add(stepPromise);
  
  stepPromise.finally(() => {
    pendingStepPromises.delete(stepPromise);
  });

  await stepPromise;
}

// ================================
// Content script sync
// ================================
async function broadcastToContentScripts(message) {
  console.log('📡 Broadcasting message:', message.type);
  
  const tabs = await chrome.tabs.query({});
  let successCount = 0;
  
  for (const tab of tabs) {
    // Skip chrome:// and extension pages
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      continue;
    }
    
    try {
      await chrome.tabs.sendMessage(tab.id, message);
      successCount++;
      console.log(`✅ Sent to tab ${tab.id}: ${tab.url?.substring(0, 50)}`);
    } catch (error) {
      console.log(`⚠️ Failed to send to tab ${tab.id}: ${error.message}`);
    }
  }
  
  console.log(`📡 Broadcast complete: ${successCount}/${tabs.length} tabs reached`);
}

// ================================
// Keep-alive mechanism (prevents SW from going inactive)
// ================================
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      if (chrome.runtime.lastError) {
        console.log("Keep-alive ping failed");
      }
    });
  }, 20000);
  
  console.log("🔄 Keep-alive started");
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log("⏸️ Keep-alive stopped");
  }
}

// ================================
// Restore state on service worker restart
// ================================
(async function restoreState() {
  const stored = await chrome.storage.session.get([
    "isRecording",
    "sessionId",
  ]);

  if (stored.isRecording && stored.sessionId) {
    isRecording = true;
    sessionId = stored.sessionId;
    steps = [];
    startKeepAlive();

    console.log("🔄 Restored recording state:", sessionId);
    broadcastToContentScripts({ type: "START_RECORDING" });
  }
})();

// ================================
// Message listener
// ================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data, payload } = message;

  console.log("📨 Message received:", type, sender.tab?.id ? `from tab ${sender.tab.id}` : 'from popup');

  switch (type) {
    case "START_RECORDING":
      startRecording().then((id) => {
        broadcastToContentScripts({ type: "START_RECORDING" });
        sendResponse({ success: true, sessionId: id });
      });
      return true;

    case "STOP_RECORDING":
      stopRecording(data?.webhookUrl).then(() => {
        broadcastToContentScripts({ type: "STOP_RECORDING" });
        sendResponse({ success: true });
      });
      return true;

    case "NEW_STEP":
      console.log("📝 NEW_STEP received:", payload?.action, payload?.label?.substring(0, 30));
      addStep(payload).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case "GET_STATUS":
      sendResponse({
        isRecording,
        sessionId,
        stepCount: steps.length,
      });
      return true;

    default:
      console.warn("Unknown message type:", type);
      return false;
  }
});

console.log("✅ Background service worker initialized");