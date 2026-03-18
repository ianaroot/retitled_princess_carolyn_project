// state/History.js
// Snapshot-based undo/redo manager

import { MAX_HISTORY } from '../constants.js'

/**
 * History manager for undo/redo
 * 
 * Uses snapshot-based approach: entire graph state captured as JSON.
 * 
 * CRITICAL: Only SyncManager calls history.push() after successful server sync.
 * Handlers never call history.push() directly.
 * 
 * History is passed explicitly to components that need it, NOT stored in Store
 * (avoids circular dependency).
 */
class History {
  /**
   * Create history manager
   * @param {Store} store - Store instance for state snapshots
   * @param {number} [maxHistory=MAX_HISTORY] - Maximum snapshots to store
   */
  constructor(store, maxHistory = MAX_HISTORY) {
    this.store = store
    
    // Snapshot stack
    this.snapshots = []
    this.currentIndex = -1
    
    // Configuration
    this.maxHistory = maxHistory
    
    // Batch tracking to prevent orphaned batch state
    this.batchDepth = 0
    this.batchDescription = null
    
    // Flag to prevent history operations during restore
    this.isRestoring = false
    
    // UI update callback
    this.updateUICallback = null
  }
  
  // ===== Core Operations =====
  
  /**
   * Push a snapshot to history
   * Called by SyncManager after successful server sync.
   * 
   * @param {string} description - Human-readable description
   * @param {Object|null} [operation=null] - Operation metadata for undo/redo sync
   */
  push(description, operation = null) {
    // Don't push during restore
    if (this.isRestoring) {
      return
    }
    
    // If in batch, don't push yet
    if (this.batchDepth > 0) {
      return
    }
    
    // Truncate any redo snapshots (we're creating a new branch)
    if (this.currentIndex < this.snapshots.length - 1) {
      this.snapshots = this.snapshots.slice(0, this.currentIndex + 1)
    }
    
    // Create snapshot with operation metadata
    const snapshot = {
      description,
      timestamp: Date.now(),
      state: this.store.getState(),
      operation
    }
    
    // Add to stack
    this.snapshots.push(snapshot)
    
    // Enforce max history
    if (this.snapshots.length > this.maxHistory) {
      this.snapshots.shift()
    } else {
      this.currentIndex++
    }
    
    this.updateUI()
  }
  
  /**
   * Undo the last operation (local only - SyncManager handles server sync)
   * Restores state from previous snapshot
   */
  undo() {
    if (!this.canUndo()) {
      return
    }
    
    this.isRestoring = true
    
    try {
      this.currentIndex--
      const snapshot = this.snapshots[this.currentIndex]
      this.store.restoreState(snapshot.state)
      this.updateUI()
    } finally {
      this.isRestoring = false
    }
  }
  
  /**
   * Redo a previously undone operation (local only - SyncManager handles server sync)
   */
  redo() {
    if (!this.canRedo()) {
      return
    }
    
    this.isRestoring = true
    
    try {
      this.currentIndex++
      const snapshot = this.snapshots[this.currentIndex]
      this.store.restoreState(snapshot.state)
      this.updateUI()
    } finally {
      this.isRestoring = false
    }
  }
  
  /**
   * Local-only undo (called by SyncManager after server sync completes)
   */
  undoLocal() {
    if (!this.canUndo()) {
      return
    }
    
    this.isRestoring = true
    
    try {
      this.currentIndex--
      const snapshot = this.snapshots[this.currentIndex]
      this.store.restoreState(snapshot.state)
      this.updateUI()
    } finally {
      this.isRestoring = false
    }
  }
  
  /**
   * Local-only redo (called by SyncManager after server sync completes)
   */
  redoLocal() {
    if (!this.canRedo()) {
      return
    }
    
    this.isRestoring = true
    
    try {
      this.currentIndex++
      const snapshot = this.snapshots[this.currentIndex]
      this.store.restoreState(snapshot.state)
      this.updateUI()
    } finally {
      this.isRestoring = false
    }
  }
  
  // ===== Query Methods =====
  
  /**
   * Check if undo is available
   * @returns {boolean}
   */
  canUndo() {
    return this.currentIndex > 0
  }
  
  /**
   * Check if redo is available
   * @returns {boolean}
   */
  canRedo() {
    return this.currentIndex < this.snapshots.length - 1
  }
  
  /**
   * Get current history position
   * @returns {number}
   */
  getCurrentIndex() {
    return this.currentIndex
  }
  
  /**
   * Get total snapshots
   * @returns {number}
   */
  getTotalSnapshots() {
    return this.snapshots.length
  }
  
  /**
   * Get history display string (e.g., "5/50")
   * @returns {string}
   */
  getHistoryDisplay() {
    if (this.snapshots.length === 0) return `(0/${this.maxHistory})`
    return `(${this.currentIndex + 1}/${this.maxHistory})`
  }
  
  /**
   * Get current description
   * @returns {string|null}
   */
  getCurrentDescription() {
    if (this.currentIndex < 0) return null
    return this.snapshots[this.currentIndex]?.description || null
  }
  
  /**
   * Get current snapshot (for SyncManager to access operation metadata)
   * @returns {Object|null}
   */
  getCurrentSnapshot() {
    if (this.currentIndex < 0) return null
    return this.snapshots[this.currentIndex]
  }
  
  /**
   * Get next snapshot (for redo operations)
   * @returns {Object|null}
   */
  getNextSnapshot() {
    if (this.currentIndex < 0) return null
    if (this.currentIndex >= this.snapshots.length - 1) return null
    return this.snapshots[this.currentIndex + 1]
  }
  
  // ===== Batch Operations =====
  
  /**
   * Start a batch operation
   * History won't be pushed until endBatch()
   */
  startBatch() {
    if (this.batchDepth === 0) {
      this.batchDescription = null
    }
    this.batchDepth++
  }
  
  /**
   * End a batch operation and push to history
   * @param {string} description - Description for the batch
   */
  endBatch(description) {
    this.batchDepth--
    
    if (this.batchDepth < 0) {
      console.error('endBatch() called without matching startBatch()')
      this.batchDepth = 0
      return
    }
    
    if (this.batchDepth === 0 && description) {
      this.push(description)
    }
  }
  
  /**
   * Execute a function as a batch
   * @param {string} description - Description for the batch
   * @param {Function} fn - Function to execute
   */
  batch(description, fn) {
    this.startBatch()
    try {
      fn()
    } finally {
      this.endBatch(description)
    }
  }
  
  /**
   * Reset batch state (cleanup after errors)
   */
  resetBatch() {
    this.batchDepth = 0
    this.batchDescription = null
  }
  
  // ===== Utility Methods =====
  
  /**
   * Clear all history
   */
  clear() {
    this.snapshots = []
    this.currentIndex = -1
    this.batchDepth = 0
    this.batchDescription = null
    this.updateUI()
  }
  
  /**
   * Set UI update callback
   * @param {Function} callback - Called after push/undo/redo/clear
   */
  setUpdateUICallback(callback) {
    this.updateUICallback = callback
  }
  
  /**
   * Trigger UI update
   */
  updateUI() {
    if (this.updateUICallback) {
      try {
        this.updateUICallback()
      } catch (error) {
        console.error('Error in history UI callback:', error)
      }
    }
  }
  
  // ===== Debugging =====
  
  /**
   * Get debug info
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      currentIndex: this.currentIndex,
      totalSnapshots: this.snapshots.length,
      maxHistory: this.maxHistory,
      batchDepth: this.batchDepth,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      descriptions: this.snapshots.map(s => s.description)
    }
  }
}

export default History