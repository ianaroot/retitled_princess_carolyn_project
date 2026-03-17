// utils/errors.js
// Error handling utilities for editorV2

/**
 * Display an error banner to the user
 * Uses textContent for XSS safety
 * @param {string} message - Error message to display
 * @param {number} [duration=5000] - Duration in milliseconds before auto-dismiss
 */
export function showError(message, duration = 5000) {
  const banner = document.createElement('div')
  banner.className = 'editor-error-banner'
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #fee;
    border: 2px solid #c00;
    color: #c00;
    padding: 15px;
    border-radius: 5px;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    font-family: sans-serif;
    font-size: 14px;
  `
  
  // Use textContent for security (prevents XSS)
  banner.textContent = message
  
  document.body.appendChild(banner)
  
  // Auto-dismiss after duration
  setTimeout(() => {
    if (banner.parentNode) {
      banner.remove()
    }
  }, duration)
  
  return banner
}

/**
 * Display an info banner to the user
 * @param {string} message - Info message to display
 * @param {number} [duration=3000] - Duration in milliseconds before auto-dismiss
 */
export function showInfo(message, duration = 3000) {
  const banner = document.createElement('div')
  banner.className = 'editor-info-banner'
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #e8f5e9;
    border: 2px solid #4CAF50;
    color: #2e7d32;
    padding: 15px;
    border-radius: 5px;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    font-family: sans-serif;
    font-size: 14px;
  `
  
  banner.textContent = message
  
  document.body.appendChild(banner)
  
  setTimeout(() => {
    if (banner.parentNode) {
      banner.remove()
    }
  }, duration)
  
  return banner
}

/**
 * Display a warning banner to the user
 * @param {string} message - Warning message to display
 * @param {number} [duration=4000] - Duration in milliseconds before auto-dismiss
 */
export function showWarning(message, duration = 4000) {
  const banner = document.createElement('div')
  banner.className = 'editor-warning-banner'
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #fff3e0;
    border: 2px solid #ff9800;
    color: #e65100;
    padding: 15px;
    border-radius: 5px;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    font-family: sans-serif;
    font-size: 14px;
  `
  
  banner.textContent = message
  
  document.body.appendChild(banner)
  
  setTimeout(() => {
    if (banner.parentNode) {
      banner.remove()
    }
  }, duration)
  
  return banner
}

/**
 * Log an error with context
 * @param {string} context - Where the error occurred
 * @param {Error|string} error - The error object or message
 */
export function logError(context, error) {
  const timestamp = new Date().toISOString()
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${timestamp}] [${context}] ${message}`, error)
}

export default { showError, showInfo, showWarning, logError }