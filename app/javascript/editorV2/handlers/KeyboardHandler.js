// handlers/KeyboardHandler.js
// Handles keyboard shortcuts for undo/redo and other actions

/**
 * KeyboardHandler
 * 
 * Handles:
 * - Undo: Ctrl+Z / Cmd+Z
 * - Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
 * - Delete: Delete key / Backspace (handled by ClickHandler)
 * 
 * IMPORTANT: Receives History directly (not via Store.history) to avoid circular dependency.
 */
class KeyboardHandler {
  /**
   * Create KeyboardHandler
   * @param {Store} store - Store instance
   * @param {History} history - History instance (passed directly)
   * @param {SyncManager} syncManager - SyncManager instance (for undo/redo)
   */
  constructor(store, history, syncManager) {
    this.store = store
    this.history = history
    this.syncManager = syncManager
    
    // Pre-bound handler
    this.boundHandleKeyDown = this.handleKeyDown.bind(this)
    
    // Attached state
    this.isAttached = false
  }
  
  /**
   * Attach keyboard listeners
   */
  attach() {
    if (this.isAttached) {
      return
    }
    
    document.addEventListener('keydown', this.boundHandleKeyDown)
    this.isAttached = true
  }
  
  /**
   * Detach keyboard listeners
   */
  detach() {
    if (!this.isAttached) {
      return
    }
    
    document.removeEventListener('keydown', this.boundHandleKeyDown)
    this.isAttached = false
  }
  
  /**
   * Handle keydown events
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    // Ignore if in input field
    if (this.isInputElement(event.target)) {
      return
    }
    
    // Undo: Ctrl+Z / Cmd+Z
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault()
      this.undo()
      return
    }
    
    // Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
    if ((event.ctrlKey || event.metaKey) && 
        ((event.key === 'z' && event.shiftKey) || event.key === 'y')) {
      event.preventDefault()
      this.redo()
      return
    }
  }
  
  /**
   * Check if target is an input element
   * @param {EventTarget} target
   * @returns {boolean}
   */
  isInputElement(target) {
    if (!target || !target.tagName) {
      return false
    }
    
    const tag = target.tagName.toLowerCase()
    const isEditable = target.isContentEditable
    
    return tag === 'input' || tag === 'textarea' || tag === 'select' || isEditable
  }
  
  /**
   * Perform undo (async - syncs with server)
   */
  async undo() {
    if (!this.history.canUndo()) return
    if (this.syncManager.isUndoRedoPending) return
    
    await this.syncManager.undo()
    this.updateUndoRedoUI()
  }
  
  /**
   * Perform redo (async - syncs with server)
   */
  async redo() {
    if (!this.history.canRedo()) return
    if (this.syncManager.isUndoRedoPending) return
    
    await this.syncManager.redo()
    this.updateUndoRedoUI()
  }
  
  /**
   * Update undo/redo button UI
   */
  updateUndoRedoUI() {
    const undoBtn = document.querySelector('.btn-undo')
    const redoBtn = document.querySelector('.btn-redo')
    
    if (undoBtn) {
      undoBtn.disabled = !this.history.canUndo() || this.syncManager.isUndoRedoPending
      undoBtn.classList.toggle('loading', this.syncManager.isUndoRedoPending)
    }
    if (redoBtn) {
      redoBtn.disabled = !this.history.canRedo() || this.syncManager.isUndoRedoPending
      redoBtn.classList.toggle('loading', this.syncManager.isUndoRedoPending)
    }
  }
  
  /**
   * Get undo availability
   * @returns {boolean}
   */
  canUndo() {
    return this.history.canUndo() && !this.syncManager.isUndoRedoPending
  }
  
  /**
   * Get redo availability
   * @returns {boolean}
   */
  canRedo() {
    return this.history.canRedo() && !this.syncManager.isUndoRedoPending
  }
  
  /**
   * Cleanup on destroy
   */
  destroy() {
    this.detach()
  }
}

export default KeyboardHandler