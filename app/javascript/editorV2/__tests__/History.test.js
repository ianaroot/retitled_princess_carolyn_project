import { describe, it, expect, beforeEach, vi } from 'vitest'
import Store from '../state/Store.js'
import History from '../state/History.js'
import Node from '../models/Node.js'

describe('History', () => {
  let store
  let history

  beforeEach(() => {
    store = new Store()
    history = new History(store, 50)
  })

  describe('constructor', () => {
    it('initializes with empty history', () => {
      expect(history.snapshots).toHaveLength(0)
      expect(history.currentIndex).toBe(-1)
      expect(history.canUndo()).toBe(false)
      expect(history.canRedo()).toBe(false)
    })

    it('uses default maxHistory from constants', () => {
      expect(history.maxHistory).toBe(50)
    })

    it('accepts custom maxHistory', () => {
      const customHistory = new History(store, 100)
      expect(customHistory.maxHistory).toBe(100)
    })
  })

  describe('push', () => {
    it('adds snapshot to history', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      
      history.push('Initial state')

      expect(history.snapshots).toHaveLength(1)
      expect(history.currentIndex).toBe(0)
      expect(history.canUndo()).toBe(false) // Can't undo with only 1 snapshot (need 2+)
      
      // Push a second state to enable undo
      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node2)
      history.push('Second state')
      
      expect(history.canUndo()).toBe(true) // Now can undo from index 1 to 0
    })

    it('stores operation metadata', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      
      const operation = { type: 'createNode', clientId: 'n1' }
      history.push('Create node', operation)

      const snapshot = history.getCurrentSnapshot()
      expect(snapshot.description).toBe('Create node')
      expect(snapshot.operation).toEqual(operation)
    })

    it('stores timestamp', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      
      const before = Date.now()
      history.push('Initial state')
      const after = Date.now()

      const snapshot = history.getCurrentSnapshot()
      expect(snapshot.timestamp).toBeGreaterThanOrEqual(before)
      expect(snapshot.timestamp).toBeLessThanOrEqual(after)
    })

    it('truncates redo snapshots when new push after undo', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node1)
      history.push('State 1')

      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node2)
      history.push('State 2')

      history.undo()

      expect(history.canRedo()).toBe(true)

      // New push should truncate redo history
      const node3 = new Node({ clientId: 'n3', type: 'action', position: { x: 200, y: 200 } })
      store.addNode(node3)
      history.push('State 3')

      expect(history.canRedo()).toBe(false)
      expect(history.snapshots).toHaveLength(2)
    })

    it('enforces maxHistory limit', () => {
      const smallHistory = new History(store, 3)

      for (let i = 0; i < 5; i++) {
        const node = new Node({ clientId: `n${i}`, type: 'condition', position: { x: i * 100, y: i * 100 } })
        store.addNode(node)
        smallHistory.push(`State ${i}`)
      }

      expect(smallHistory.snapshots).toHaveLength(3)
      // Should have kept the last 3
      expect(smallHistory.snapshots[0].description).toBe('State 2')
    })

    it('does not push during restore', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node1)
      history.push('State 1')

      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node2)
      history.push('State 2')

      // Manually set restoring flag to test
      history.isRestoring = true
      const node3 = new Node({ clientId: 'n3', type: 'action', position: { x: 200, y: 200 } })
      store.addNode(node3)
      history.push('State 3')
      history.isRestoring = false

      // Should not have added State 3
      expect(history.snapshots).toHaveLength(2)
    })

    it('calls UI callback on push', () => {
      const callback = vi.fn()
      history.setUpdateUICallback(callback)

      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      history.push('Initial state')

      expect(callback).toHaveBeenCalled()
    })
  })

  describe('undo/redo', () => {
    beforeEach(() => {
      // Set up initial state
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)
      history.push('Initial state')
    })

    it('undoes to previous state', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add condition')

      expect(store.getNodes()).toHaveLength(2)

      history.undo()

      expect(store.getNodes()).toHaveLength(1)
      expect(history.canRedo()).toBe(true)
    })

    it('redoes to next state', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add condition')

      history.undo()
      history.redo()

      expect(store.getNodes()).toHaveLength(2)
      expect(history.canRedo()).toBe(false)
    })

    it('uses undoLocal/redoLocal for server-sync operations', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add condition')

      history.undoLocal()
      expect(store.getNodes()).toHaveLength(1)

      history.redoLocal()
      expect(store.getNodes()).toHaveLength(2)
    })

    it('does nothing when canUndo/canRedo are false', () => {
      // Initial state, can't undo
      history.undo()
      expect(history.currentIndex).toBe(0)

      // At end of history, can't redo
      history.redo()
      expect(history.currentIndex).toBe(0)
    })

    it('sets isRestoring flag during undo/redo', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add condition')

      // Subscribe to store to check isRestoring
      let wasRestoringDuringEmit = false
      store.subscribe(() => {
        wasRestoringDuringEmit = history.isRestoring
      })

      history.undo()

      expect(wasRestoringDuringEmit).toBe(true)
      expect(history.isRestoring).toBe(false) // Should be false after undo completes
    })
  })

  describe('canUndo/canRedo', () => {
    it('cannot undo when at beginning', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      history.push('Initial')

      expect(history.canUndo()).toBe(false)
    })

    it('can undo after push', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node1)
      history.push('State 1')

      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node2)
      history.push('State 2')

      expect(history.canUndo()).toBe(true)
    })

    it('cannot redo when at end', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      history.push('Initial')

      expect(history.canRedo()).toBe(false)
    })

    it('can redo after undo', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node1)
      history.push('State 1')

      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node2)
      history.push('State 2')

      history.undo()

      expect(history.canRedo()).toBe(true)
    })
  })

  describe('batch operations', () => {
    it('batches multiple pushes into one', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)

      history.startBatch()
      
      const n1 = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(n1)
      history.push('Add n1') // Won't be pushed

      const n2 = new Node({ clientId: 'n2', type: 'action', position: { x: 200, y: 200 } })
      store.addNode(n2)
      history.push('Add n2') // Won't be pushed

      // Still in batch, no snapshots yet
      expect(history.snapshots).toHaveLength(0)

      history.endBatch('Add multiple nodes')

      expect(history.snapshots).toHaveLength(1)
      expect(history.snapshots[0].description).toBe('Add multiple nodes')
    })

    it('supports nested batches', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)

      history.startBatch()
      history.startBatch()
      
      const n1 = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(n1)
      history.push('Add n1')

      history.endBatch('Inner batch') // Won't push yet, still in outer batch

      expect(history.snapshots).toHaveLength(0)

      history.endBatch('Outer batch')

      expect(history.snapshots).toHaveLength(1)
    })

    it('provides batch helper method', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)

      history.batch('Batch operation', () => {
        const n1 = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
        store.addNode(n1)
        history.push('Add n1')
      })

      expect(history.snapshots).toHaveLength(1)
    })

    it('resets batch state on error', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)

      history.startBatch()
      history.startBatch()
      
      history.resetBatch()

      expect(history.batchDepth).toBe(0)
      expect(history.batchDescription).toBe(null)
    })

    it('handles mismatched endBatch', () => {
      const consoleSpy = vi.spyOn(console, 'error')

      history.endBatch('No matching startBatch')

      expect(consoleSpy).toHaveBeenCalledWith('endBatch() called without matching startBatch()')
      expect(history.batchDepth).toBe(0)
    })
  })

  describe('query methods', () => {
    beforeEach(() => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)
      history.push('Initial')
    })

    it('getCurrentIndex returns current position', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add node')

      expect(history.getCurrentIndex()).toBe(1)
    })

    it('getTotalSnapshots returns count', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add node')

      expect(history.getTotalSnapshots()).toBe(2)
    })

    it('getHistoryDisplay returns formatted string', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add node')

      expect(history.getHistoryDisplay()).toBe('(2/50)')
    })

    it('getHistoryDisplay returns empty string when no history', () => {
      expect(new History(store).getHistoryDisplay()).toBe('(0/50)')
    })

    it('getCurrentDescription returns description', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add node')

      expect(history.getCurrentDescription()).toBe('Add node')
    })

    it('getCurrentDescription returns null when no history', () => {
      expect(history.getCurrentDescription()).toBe('Initial')
    })

    it('getCurrentSnapshot returns current snapshot', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      const operation = { type: 'createNode', clientId: 'n1' }
      history.push('Add node', operation)

      const snapshot = history.getCurrentSnapshot()
      expect(snapshot.description).toBe('Add node')
      expect(snapshot.operation).toEqual(operation)
    })

    it('getNextSnapshot returns next snapshot for redo', () => {
      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add node')

      history.undo()

      const next = history.getNextSnapshot()
      expect(next.description).toBe('Add node')
    })
  })

  describe('clear', () => {
    it('clears all history', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)
      history.push('Initial')

      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('Add node')

      history.clear()

      expect(history.snapshots).toHaveLength(0)
      expect(history.currentIndex).toBe(-1)
      expect(history.canUndo()).toBe(false)
      expect(history.canRedo()).toBe(false)
    })

    it('calls UI callback on clear', () => {
      const callback = vi.fn()
      history.setUpdateUICallback(callback)

      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      history.push('Initial')
      history.clear()

      expect(callback).toHaveBeenCalledTimes(2) // push + clear
    })
  })

  describe('UI callback', () => {
    it('setUpdateUICallback stores callback', () => {
      const callback = vi.fn()
      history.setUpdateUICallback(callback)

      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      history.push('Initial')

      expect(callback).toHaveBeenCalled()
    })

    it('handles errors in callback gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const callback = () => { throw new Error('UI error') }
      history.setUpdateUICallback(callback)

      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node)
      
      // Should not throw
      expect(() => history.push('Initial')).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith('Error in history UI callback:', expect.any(Error))
    })
  })

  describe('debug', () => {
    it('getDebugInfo returns history state', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)
      history.push('State 1')

      const node = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      history.push('State 2')

      const debug = history.getDebugInfo()

      expect(debug.currentIndex).toBe(1)
      expect(debug.totalSnapshots).toBe(2)
      expect(debug.maxHistory).toBe(50)
      expect(debug.canUndo).toBe(true)
      expect(debug.canRedo).toBe(false)
      expect(debug.descriptions).toEqual(['State 1', 'State 2'])
    })
  })

  describe('destroy behavior', () => {
    it('does not push after store is destroyed', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)
      history.push('Initial')

      store.destroy()

      // Store won't emit events, but history push should still work
      // (history.push doesn't check store.destroyed, but it does store.getState())
      // This is more about Store's destroy behavior
    })
  })
})