// handlers/ToolbarHandler.js
// Handles toolbar buttons: Add Node, Undo, Redo

import { NODE_DIMENSIONS } from '../constants.js'

const NODE_PLACEMENT_PADDING = 40
const NODE_PLACEMENT_STEP = 36
const NODE_PLACEMENT_RING_STEPS = 10
const NODE_PLACEMENT_MAX_RINGS = 12

/**
 * ToolbarHandler
 * 
 * Handles:
 * - Add Node buttons (+ Condition, + Action)
 * - Undo/Redo buttons
 * - Delete button (if not handled by ClickHandler)
 */
class ToolbarHandler {
  /**
   * Create ToolbarHandler
   * @param {Store} store - Store instance
   * @param {History} history - History instance
   * @param {SyncManager} syncManager - SyncManager instance
   * @param {HTMLElement} container - Nodes canvas container (for positioning)
   * @param {ClickHandler} clickHandler - ClickHandler instance (for node selection)
   */
  constructor(store, history, syncManager, container, clickHandler, viewport = null) {
    this.store = store
    this.history = history
    this.syncManager = syncManager
    this.container = container
    this.clickHandler = clickHandler
    this.viewport = viewport
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
    
    // Delete node button
    const deleteBtn = document.querySelector('.btn-delete-node')
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.handleDeleteClick())
    }

  }
  
  /**
   * Handle Add Node button click
   * @param {Event} e - Click event
   */
  async handleAddNode(e) {
    const type = e.target.dataset.type
    if (!type) return

    const position = this.findPlacementPosition(type)
    
    try {
      await this.syncManager.createNode(type, position, {})
    } catch (err) {
      console.error('Failed to create node:', err)
    }
  }

  findPlacementPosition(type) {
    const center = this.viewport?.getVisibleCanvasCenter() || { x: 200, y: 200 }
    const dims = NODE_DIMENSIONS[type] || NODE_DIMENSIONS.default
    const anchor = {
      x: Math.max(0, center.x - (dims.width / 2)),
      y: Math.max(0, center.y - (dims.height / 2))
    }

    if (this.isPositionClear(anchor, dims)) {
      return anchor
    }

    for (let ring = 1; ring <= NODE_PLACEMENT_MAX_RINGS; ring += 1) {
      const radius = ring * NODE_PLACEMENT_STEP

      for (let step = 0; step < NODE_PLACEMENT_RING_STEPS; step += 1) {
        const angle = (Math.PI * 2 * step) / NODE_PLACEMENT_RING_STEPS
        const candidate = {
          x: Math.max(0, Math.round(anchor.x + (Math.cos(angle) * radius))),
          y: Math.max(0, Math.round(anchor.y + (Math.sin(angle) * radius)))
        }

        if (this.isPositionClear(candidate, dims)) {
          return candidate
        }
      }
    }

    return anchor
  }

  isPositionClear(candidate, candidateDims) {
    const candidateBounds = {
      left: candidate.x,
      right: candidate.x + candidateDims.width,
      top: candidate.y,
      bottom: candidate.y + candidateDims.height
    }

    return this.store.getNodes().every(node => {
      const dims = NODE_DIMENSIONS[node.type] || NODE_DIMENSIONS.default
      const nodeBounds = {
        left: node.position.x - NODE_PLACEMENT_PADDING,
        right: node.position.x + dims.width + NODE_PLACEMENT_PADDING,
        top: node.position.y - NODE_PLACEMENT_PADDING,
        bottom: node.position.y + dims.height + NODE_PLACEMENT_PADDING
      }

      return (
        candidateBounds.right <= nodeBounds.left ||
        candidateBounds.left >= nodeBounds.right ||
        candidateBounds.bottom <= nodeBounds.top ||
        candidateBounds.top >= nodeBounds.bottom
      )
    })
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
    
    this.updateDeleteButton()
  }
  
  /**
   * Handle delete node button click
   */
  handleDeleteClick() {
    this.clickHandler?.deleteSelectedNode()
  }
  
  /**
   * Update delete button state based on selection
   */
  updateDeleteButton() {
    const deleteBtn = document.querySelector('.btn-delete-node')
    if (!deleteBtn) return
    
    const selectedId = this.clickHandler?.getSelectedNodeId()
    const node = selectedId ? this.store.getNode(selectedId) : null
    
    // Disable if: no selection OR root node
    const isDisabled = !selectedId || (node && node.type === 'root')
    deleteBtn.disabled = isDisabled
  }
  
  /**
   * Cleanup
   */
  destroy() {
    // Event listeners are on document elements, cleaned up automatically
  }
}

export default ToolbarHandler
