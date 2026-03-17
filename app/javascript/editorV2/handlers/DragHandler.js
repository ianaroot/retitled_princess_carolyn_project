// handlers/DragHandler.js
// Handles node drag operations with optimistic updates

import { EVENTS } from '../constants.js'

/**
 * DragHandler
 * 
 * Handles:
 * - Mouse down on nodes to start drag
 * - Mouse move during drag
 * - Mouse up to end drag and sync
 * 
 * IMPORTANT: This handler never calls history.push() directly.
 * SyncManager handles history push after successful server sync.
 */
class DragHandler {
  /**
   * Create DragHandler
   * @param {Store} store - Store instance
   * @param {SyncManager} syncManager - SyncManager instance
   * @param {History} history - History instance (passed for UI updates only)
   */
  constructor(store, syncManager, history) {
    this.store = store
    this.syncManager = syncManager
    this.history = history
    
    // Drag state
    this.isDragging = false
    this.draggedClientId = null
    this.draggedNode = null
    this.startPosition = null
    this.offset = { x: 0, y: 0 }
    this.hasMoved = false
    
    // Pre-bound handlers (fixes removeEventListener bug)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    
    // Element-to-clientId mappings
    this.attachedElements = new WeakMap()
  }
  
  /**
   * Attach drag handlers to a node element
   * @param {HTMLElement} element - Node element
   * @param {string} clientId - Node client ID
   */
  attach(element, clientId) {
    // Prevent duplicate attachments
    if (this.attachedElements.has(element)) {
      return
    }
    
    this.attachedElements.set(element, clientId)
    
    // Mouse down starts potential drag
    element.addEventListener('mousedown', (e) => this.handleMouseDown(e, clientId, element))
  }
  
  /**
   * Handle mouse down on a node
   * @param {MouseEvent} event
   * @param {string} clientId
   * @param {HTMLElement} element
   */
  handleMouseDown(event, clientId, element) {
    // Only left click
    if (event.button !== 0) {
      return
    }
    
    // Don't interfere with connector clicks
    if (event.target.classList.contains('node-connector')) {
      return
    }
    
    // Don't start drag on root nodes (they shouldn't move)
    const node = this.store.getNode(clientId)
    if (!node || node.type === 'root') {
      return
    }
    
    event.preventDefault()
    event.stopPropagation()
    
    // Initialize drag state
    this.isDragging = true
    this.draggedClientId = clientId
    this.draggedNode = node
    this.hasMoved = false
    
    // Store start position (for potential rollback)
    this.startPosition = { ...node.position }
    
    // Calculate offset (where in the node the mouse clicked)
    const rect = element.getBoundingClientRect()
    this.offset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    }
    
    // Add visual feedback
    element.classList.add('dragging')
    
    // Attach document-level handlers for drag
    document.addEventListener('mousemove', this.boundHandleMouseMove)
    document.addEventListener('mouseup', this.boundHandleMouseUp)
    
    // Update selection
    this.store.setSelectedNode(clientId)
  }
  
  /**
   * Handle mouse move during drag
   * @param {MouseEvent} event
   */
  handleMouseMove(event) {
    if (!this.isDragging || !this.draggedClientId) {
      return
    }
    
    // Get canvas container for position calculation
    const canvas = document.getElementById('nodes-canvas')
    if (!canvas) {
      return
    }
    
    // Calculate new position
    const canvasRect = canvas.getBoundingClientRect()
    const x = event.clientX - canvasRect.left - this.offset.x
    const y = event.clientY - canvasRect.top - this.offset.y
    
    // Skip if position hasn't changed
    const node = this.store.getNode(this.draggedClientId)
    if (node && node.position.x === x && node.position.y === y) {
      return
    }
    
    this.hasMoved = true
    
    // Optimistic update: update store immediately
    this.store.updateNode(this.draggedClientId, { position: { x, y } })
    
    // Update element position directly for smoother rendering
    const element = document.querySelector(`[data-client-id="${this.draggedClientId}"]`)
    if (element) {
      element.style.left = `${x}px`
      element.style.top = `${y}px`
    }
  }
  
  /**
   * Handle mouse up to end drag
   * @param {MouseEvent} event
   */
  handleMouseUp(event) {
    // Remove document handlers immediately
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
    
    // Remove visual feedback
    if (this.draggedClientId) {
      const element = document.querySelector(`[data-client-id="${this.draggedClientId}"]`)
      if (element) {
        element.classList.remove('dragging')
      }
    }
    
    // Sync with server if we moved
    if (this.hasMoved && this.draggedClientId && this.draggedNode) {
      const node = this.store.getNode(this.draggedClientId)
      if (node) {
        // SyncManager handles: update position, history push
        this.syncManager.updateNodePosition(
          this.draggedClientId,
          node.position.x,
          node.position.y
        ).catch(err => {
          console.error('Failed to sync drag position:', err)
        })
      }
    }
    
    // Reset state
    this.isDragging = false
    this.draggedClientId = null
    this.draggedNode = null
    this.startPosition = null
    this.hasMoved = false
  }
  
  /**
   * Check if currently dragging
   * @returns {boolean}
   */
  isCurrentlyDragging() {
    return this.isDragging
  }
  
  /**
   * Get the currently dragged node's client ID
   * @returns {string|null}
   */
  getDraggedNodeId() {
    return this.draggedClientId
  }
  
  /**
   * Cancel current drag (for external use)
   */
  cancelDrag() {
    if (this.isDragging) {
      // Restore start position
      if (this.startPosition && this.draggedClientId) {
        this.store.updateNode(this.draggedClientId, { position: this.startPosition })
        
        const element = document.querySelector(`[data-client-id="${this.draggedClientId}"]`)
        if (element) {
          element.style.left = `${this.startPosition.x}px`
          element.style.top = `${this.startPosition.y}px`
          element.classList.remove('dragging')
        }
      }
      
      // Remove handlers
      document.removeEventListener('mousemove', this.boundHandleMouseMove)
      document.removeEventListener('mouseup', this.boundHandleMouseUp)
      
      // Reset state
      this.isDragging = false
      this.draggedClientId = null
      this.startPosition = null
      this.hasMoved = false
    }
  }
  
  /**
   * Cleanup on destroy
   */
  destroy() {
    // Cancel any active drag
    this.cancelDrag()
    
    // Clear mappings
    this.attachedElements = new WeakMap()
  }
}

export default DragHandler