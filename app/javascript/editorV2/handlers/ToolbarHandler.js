//  * Handles:
//  * - Add Node buttons (+ Condition, + Action)
//  * - Undo/Redo buttons
//  * - Delete button (if not handled by ClickHandler)
//  * - Zoom controls (future - deferred for MVP)
//  */
class ToolbarHandler {
//   /**
//    * Create ToolbarHandler
//    * @param {Store} store - Store instance
//    * @param {History} history - History instance
//    * @param {SyncManager} syncManager - SyncManager instance
//    * @param {HTMLElement} container - Nodes canvas container (for positioning)
//    */
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
      undoBtn.addEventListener('click', () => this.history.undo())
    }
    
    // Redo button
    const redoBtn = document.querySelector('.btn-redo')
    if (redoBtn) {
      redoBtn.addEventListener('click', () => this.history.redo())
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
   * Cleanup
   */
  destroy() {
    // Event listeners are on document elements, cleaned up automatically
    this.nodeCount = 0
  }
}
export default ToolbarHandler