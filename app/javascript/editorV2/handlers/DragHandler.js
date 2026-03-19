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
 * Child dragging:
 * - By default, dragging a node also moves all its descendants
 * - Hold Shift while dragging to move only the selected node
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
    
    // Child drag state
    this.shouldDragChildren = true
    this.childOffsets = new Map()  // Map<clientId, { dx, dy, startX, startY }>
    
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
    
    // Check Shift key: hold Shift to drag node alone (without children)
    this.shouldDragChildren = !event.shiftKey
    
    if (this.shouldDragChildren) {
      // Find all descendants and store their offsets relative to dragged node
      this.childOffsets.clear()
      const descendantIds = this.store.graph.getDescendantIds(clientId)
      
      descendantIds.forEach(id => {
        const child = this.store.getNode(id)
        if (child) {
          this.childOffsets.set(id, {
            dx: child.position.x - node.position.x,
            dy: child.position.y - node.position.y,
            startX: child.position.x,
            startY: child.position.y
          })
        }
      })
    }
    
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
    
    // Optimistic update: update dragged node
    this.store.updateNode(this.draggedClientId, { position: { x, y } })
    
    // Update DOM for dragged node directly for smoother rendering
    const element = document.querySelector(`[data-client-id="${this.draggedClientId}"]`)
    if (element) {
      element.style.left = `${x}px`
      element.style.top = `${y}px`
    }
    
    // Update all descendants with same delta
    if (this.shouldDragChildren) {
      this.childOffsets.forEach((offset, childId) => {
        const childX = x + offset.dx
        const childY = y + offset.dy
        
        this.store.updateNode(childId, { position: { x: childX, y: childY } })
        
        const childElement = document.querySelector(`[data-client-id="${childId}"]`)
        if (childElement) {
          childElement.style.left = `${childX}px`
          childElement.style.top = `${childY}px`
        }
      })
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
        if (this.shouldDragChildren && this.childOffsets.size > 0) {
          // Multi-node drag: use batch update
          const positions = [
            { clientId: this.draggedClientId, x: node.position.x, y: node.position.y }
          ]
          
          this.childOffsets.forEach((offset, childId) => {
            const child = this.store.getNode(childId)
            if (child) {
              positions.push({
                clientId: childId,
                x: child.position.x,
                y: child.position.y
              })
            }
          })
          
          const descendantCount = this.childOffsets.size
          const description = `Move ${this.draggedNode.type} node (+ ${descendantCount} descendants)`
          
          this.syncManager.batchUpdatePositions(positions, description)
            .catch(err => {
              console.error('Failed to sync drag positions:', err)
            })
        } else {
          // Single-node drag
          this.syncManager.updateNodePosition(
            this.draggedClientId,
            node.position.x,
            node.position.y
          ).catch(err => {
            console.error('Failed to sync drag position:', err)
          })
        }
      }
    }
    
    // Reset state
    this.isDragging = false
    this.draggedClientId = null
    this.draggedNode = null
    this.startPosition = null
    this.hasMoved = false
    this.childOffsets.clear()
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
      // Restore dragged node position
      if (this.startPosition && this.draggedClientId) {
        this.store.updateNode(this.draggedClientId, { position: this.startPosition })
        
        const element = document.querySelector(`[data-client-id="${this.draggedClientId}"]`)
        if (element) {
          element.style.left = `${this.startPosition.x}px`
          element.style.top = `${this.startPosition.y}px`
          element.classList.remove('dragging')
        }
      }
      
      // Restore descendant positions
      if (this.shouldDragChildren) {
        this.childOffsets.forEach((offset, childId) => {
          this.store.updateNode(childId, { position: { x: offset.startX, y: offset.startY } })
          
          const childElement = document.querySelector(`[data-client-id="${childId}"]`)
          if (childElement) {
            childElement.style.left = `${offset.startX}px`
            childElement.style.top = `${offset.startY}px`
          }
        })
      }
      
      // Remove handlers
      document.removeEventListener('mousemove', this.boundHandleMouseMove)
      document.removeEventListener('mouseup', this.boundHandleMouseUp)
      
      // Reset state
      this.isDragging = false
      this.draggedClientId = null
      this.startPosition = null
      this.hasMoved = false
      this.childOffsets.clear()
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