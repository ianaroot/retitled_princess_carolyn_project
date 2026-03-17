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
   * @param {SyncManager} syncManager - SyncManager instance (for delete operations)
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
   * Perform undo
   */
  undo() {
    if (this.history.canUndo()) {
      this.history.undo()
    }
  }
  
  /**
   * Perform redo
   */
  redo() {
    if (this.history.canRedo()) {
      this.history.redo()
    }
  }
  
  /**
   * Get undo availability
   * @returns {boolean}
   */
  canUndo() {
    return this.history.canUndo()
  }
  
  /**
   * Get redo availability
   * @returns {boolean}
   */
  canRedo() {
    return this.history.canRedo()
  }
  
  /**
   * Cleanup on destroy
   */
  destroy() {
    this.detach()
  }
}

export default KeyboardHandler