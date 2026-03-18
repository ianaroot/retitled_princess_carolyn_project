// handlers/ToolbarHandler.js
// Handles toolbar buttons: Add Node, Undo, Redo

/**
 * ToolbarHandler
 * 
 * Handles:
 * - Add Node buttons (+ Condition, + Action)
 * - Undo/Redo buttons
 * - Delete button (if not handled by ClickHandler)
 * - Zoom controls (future - deferred for MVP)
 */
class ToolbarHandler {
  /**
   * Create ToolbarHandler
   * @param {Store} store - Store instance
   * @param {History} history - History instance
   * @param {SyncManager} syncManager - SyncManager instance
   * @param {HTMLElement} container - Nodes canvas container (for positioning)
   */
  constructor(store, history, syncManager, container) {
    this.store = store
    this.history = history
    this.syncManager = syncManager
    this.container = container
    
    // Track node count for offset positioning
    this.nodeCount = 0
  }
  
  /**
   * Attach toolbar event listeners
   */
  attach() {
    // Add Node buttons
    document.querySelectorAll('.btn-add-node').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleAddNode(e))
    })
    
    // Undo button
    const undoBtn = document.querySelector('.btn-undo')
    if (undoBtn) {
      undoBtn.addEventListener('click', async () => {
        await this.undo()
        this.updateButtons()
      })
    }
    
    // Redo button
    const redoBtn = document.querySelector('.btn-redo')
    if (redoBtn) {
      redoBtn.addEventListener('click', async () => {
        await this.redo()
        this.updateButtons()
      })
    }
  }
  
  /**
   * Handle Add Node button click
   * @param {Event} e - Click event
   */
  async handleAddNode(e) {
    const type = e.target.dataset.type
    if (!type) return
    
    // Calculate position with offset to avoid overlap
    const offset = 100 + (this.nodeCount * 30)
    const x = offset % 600 + 100
    const y = Math.floor(offset / 600) * 100 + 100
    
    this.nodeCount++
    
    try {
      await this.syncManager.createNode(type, { x, y }, {})
    } catch (err) {
      console.error('Failed to create node:', err)
    }
  }
  
  /**
   * Perform undo (async - syncs with server)
   */
  async undo() {
    if (!this.history.canUndo()) return
    if (this.syncManager.isUndoRedoPending) return
    
    await this.syncManager.undo()
  }
  
  /**
   * Perform redo (async - syncs with server)
   */
  async redo() {
    if (!this.history.canRedo()) return
    if (this.syncManager.isUndoRedoPending) return
    
    await this.syncManager.redo()
  }
  
  /**
   * Update undo/redo button states
   */
  updateButtons() {
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
   * Cleanup
   */
  destroy() {
    // Event listeners are on document elements, cleaned up automatically
    this.nodeCount = 0
  }
}

export default ToolbarHandler