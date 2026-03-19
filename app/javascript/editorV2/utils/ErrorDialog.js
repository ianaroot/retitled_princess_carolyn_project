// utils/ErrorDialog.js
// Error dialog for undo/redo sync failures

let activeDialog = null

/**
 * Display an error dialog for undo/redo sync failures
 * @param {string} description - Operation description (e.g., "Undo: Create action node")
 * @param {Error} error - The error that occurred
 * @returns {Promise<string>} Resolves with 'retry' or 'cancel'
 */
export function showErrorDialog(description, error) {
  return new Promise((resolve) => {
    // Remove any existing dialog
    if (activeDialog) {
      activeDialog.remove()
    }
    
    const dialog = document.createElement('div')
    dialog.className = 'undo-error-dialog'
    dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <h3>Operation Failed</h3>
        <p>${escapeHtml(description)}</p>
        <p class="error-message">${escapeHtml(error.message || 'Unknown error')}</p>
        <div class="dialog-actions">
          <button class="btn-retry">Retry</button>
          <button class="btn-cancel">Cancel</button>
        </div>
      </div>
    `
    
    dialog.querySelector('.btn-retry').addEventListener('click', () => {
      activeDialog = null
      dialog.remove()
      resolve('retry')
    })
    
    dialog.querySelector('.btn-cancel').addEventListener('click', () => {
      activeDialog = null
      dialog.remove()
      resolve('cancel')
    })
    
    document.body.appendChild(dialog)
    activeDialog = dialog
  })
}

/**
 * Escape HTML special characters for safe display
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default { showErrorDialog }