// Utility module for step generation in user-manual automation tool
// Framework-agnostic, reusable helper functions
// No Chrome APIs, no event listeners, no side effects

/**
 * Generates a unique event ID
 * Uses crypto.randomUUID() if available, otherwise falls back
 * @returns {string}
 */
export function generateEventId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `event_${timestamp}_${random}`;
}

/**
 * Extracts a human-readable label from a DOM element
 * @param {HTMLElement} element
 * @returns {string}
 */
export function extractElementLabel(element) {
  if (!element) return "Unknown element";

  if (element.innerText && element.innerText.trim()) {
    const text = element.innerText.trim();
    return text.length > 100 ? text.slice(0, 100) + "..." : text;
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  if (element.name && element.name.trim()) return element.name.trim();

  if (element.placeholder && element.placeholder.trim()) {
    return element.placeholder.trim();
  }

  return "Unknown element";
}

/**
 * Builds a structured step object
 * ⚠ Screenshot is OPTIONAL and injected by background.js
 *
 * @param {string} action
 * @param {string} label
 * @param {string|null} screenshot
 * @returns {Object}
 */
export function buildStepObject(action, label, screenshot = null) {
  return {
    eventId: generateEventId(),
    action,
    label,
    timestamp: Date.now(),
    url: typeof window !== "undefined" ? window.location.href : "unknown",
    screenshot, // injected later by background.js
  };
}
