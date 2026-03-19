import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import DragHandler from '../handlers/DragHandler.js'
import Store from '../state/Store.js'
import History from '../state/History.js'
import Node from '../models/Node.js'
import Connection from '../models/Connection.js'

// Mock SyncManager
class MockSyncManager {
  constructor() {
    this.updateNodePosition = vi.fn().mockResolvedValue({})
    this.batchUpdatePositions = vi.fn().mockResolvedValue({})
  }
}

describe('DragHandler', () => {
  let store
  let history
  let syncManager
  let dragHandler
  let mockElement

  beforeEach(() => {
    store = new Store()
    history = new History(store)
    syncManager = new MockSyncManager()
    dragHandler = new DragHandler(store, syncManager, history)
    
    // Mock DOM elements
    mockElement = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      classList: { add: vi.fn(), remove: vi.fn() },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 50 }),
      style: {},
      dataset: { clientId: 'node-1' }
    }
    
    // Minimal DOM mock
    global.document = {
      getElementById: vi.fn(() => ({
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelector: vi.fn(() => mockElement)
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('initializes with empty drag state', () => {
      expect(dragHandler.isDragging).toBe(false)
      expect(dragHandler.draggedClientId).toBe(null)
      expect(dragHandler.childOffsets.size).toBe(0)
      expect(dragHandler.shouldDragChildren).toBe(true)
    })
  })

  describe('handleMouseDown', () => {
    it('does not start drag on root nodes', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(root)

      const event = { button: 0, target: { classList: { contains: vi.fn(() => false) } } }
      dragHandler.handleMouseDown(event, 'root', mockElement)

      expect(dragHandler.isDragging).toBe(false)
    })

    it('does not start drag on right click', () => {
      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      const event = { button: 2, target: { classList: { contains: vi.fn(() => false) } } }
      dragHandler.handleMouseDown(event, 'node-1', mockElement)

      expect(dragHandler.isDragging).toBe(false)
    })

    it('does not start drag on connector click', () => {
      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      const event = {
        button: 0,
        target: { classList: { contains: vi.fn(() => true) } }
      }
      dragHandler.handleMouseDown(event, 'node-1', mockElement)

      expect(dragHandler.isDragging).toBe(false)
    })

    it('initializes drag state for valid drag', () => {
      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      const event = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 50,
        clientY: 50,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(event, 'node-1', mockElement)

      expect(dragHandler.isDragging).toBe(true)
      expect(dragHandler.draggedClientId).toBe('node-1')
      expect(dragHandler.startPosition).toEqual({ x: 100, y: 100 })
    })

    it('calculates child offsets when Shift NOT held', () => {
      const parent = new Node({ clientId: 'parent', type: 'condition', position: { x: 100, y: 100 } })
      const child = new Node({ clientId: 'child', type: 'action', position: { x: 200, y: 150 } })
      const conn = new Connection({ clientId: 'conn', sourceId: 'parent', targetId: 'child' })
      store.addNode(parent)
      store.addNode(child)
      store.addConnection(conn)

      const event = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 50,
        clientY: 50,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(event, 'parent', mockElement)

      expect(dragHandler.shouldDragChildren).toBe(true)
      expect(dragHandler.childOffsets.has('child')).toBe(true)
      expect(dragHandler.childOffsets.get('child')).toEqual({
        dx: 100,
        dy: 50,
        startX: 200,
        startY: 150
      })
    })

    it('does NOT calculate child offsets when Shift held', () => {
      const parent = new Node({ clientId: 'parent', type: 'condition', position: { x: 100, y: 100 } })
      const child = new Node({ clientId: 'child', type: 'action', position: { x: 200, y: 150 } })
      const conn = new Connection({ clientId: 'conn', sourceId: 'parent', targetId: 'child' })
      store.addNode(parent)
      store.addNode(child)
      store.addConnection(conn)

      const event = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 50,
        clientY: 50,
        shiftKey: true,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(event, 'parent', mockElement)

      expect(dragHandler.shouldDragChildren).toBe(false)
      expect(dragHandler.childOffsets.size).toBe(0)
    })

    it('stores all descendants, not just direct children', () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      const parent = new Node({ clientId: 'parent', type: 'condition', position: { x: 100, y: 100 } })
      const child1 = new Node({ clientId: 'child1', type: 'action', position: { x: 200, y: 100 } })
      const grandchild = new Node({ clientId: 'grandchild', type: 'action', position: { x: 300, y: 100 } })
      const conn1 = new Connection({ clientId: 'c1', sourceId: 'root', targetId: 'parent' })
      const conn2 = new Connection({ clientId: 'c2', sourceId: 'parent', targetId: 'child1' })
      const conn3 = new Connection({ clientId: 'c3', sourceId: 'child1', targetId: 'grandchild' })
      store.addNode(root)
      store.addNode(parent)
      store.addNode(child1)
      store.addNode(grandchild)
      store.addConnection(conn1)
      store.addConnection(conn2)
      store.addConnection(conn3)

      const event = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 50,
        clientY: 50,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(event, 'parent', mockElement)

      expect(dragHandler.childOffsets.size).toBe(2)
      expect(dragHandler.childOffsets.has('child1')).toBe(true)
      expect(dragHandler.childOffsets.has('grandchild')).toBe(true)
    })
  })

  describe('handleMouseMove', () => {
    it('updates dragged node position', () => {
      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      // Start drag
      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'node-1', mockElement)

      // Move
      const moveEvent = {
        clientX: 200,
        clientY: 200,
        target: mockElement
      }
      dragHandler.handleMouseMove(moveEvent)

      const updatedNode = store.getNode('node-1')
      expect(updatedNode.position.x).toBe(200)
      expect(updatedNode.position.y).toBe(200)
    })

    it('updates descendant positions when dragging with children', () => {
      const parent = new Node({ clientId: 'parent', type: 'condition', position: { x: 100, y: 100 } })
      const child = new Node({ clientId: 'child', type: 'action', position: { x: 200, y: 150 } })
      const conn = new Connection({ clientId: 'conn', sourceId: 'parent', targetId: 'child' })
      store.addNode(parent)
      store.addNode(child)
      store.addConnection(conn)

      // Start drag (without Shift)
      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'parent', mockElement)

      // Move
      const moveEvent = {
        clientX: 200,
        clientY: 200
      }
      dragHandler.handleMouseMove(moveEvent)

      // Parent moved to 200, 200
      // Child offset was dx=100, dy=50
      // Child should be at 300, 250
      const childNode = store.getNode('child')
      expect(childNode.position.x).toBe(300)
      expect(childNode.position.y).toBe(250)
    })

    it('does NOT update descendant positions when Shift held', () => {
      const parent = new Node({ clientId: 'parent', type: 'condition', position: { x: 100, y: 100 } })
      const child = new Node({ clientId: 'child', type: 'action', position: { x: 200, y: 150 } })
      const conn = new Connection({ clientId: 'conn', sourceId: 'parent', targetId: 'child' })
      store.addNode(parent)
      store.addNode(child)
      store.addConnection(conn)

      // Start drag (with Shift)
      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        shiftKey: true,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'parent', mockElement)

      // Move
      const moveEvent = {
        clientX: 200,
        clientY: 200
      }
      dragHandler.handleMouseMove(moveEvent)

      // Parent moved to 200, 200
      // Child should NOT have moved
      const childNode = store.getNode('child')
      expect(childNode.position.x).toBe(200)
      expect(childNode.position.y).toBe(150)
    })
  })

  describe('handleMouseUp', () => {
    it('calls updateNodePosition for single-node drag', async () => {
      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      // Start drag
      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'node-1', mockElement)

      // Move
      const moveEvent = { clientX: 200, clientY: 200 }
      dragHandler.handleMouseMove(moveEvent)

      // End drag
      const endEvent = {}
      dragHandler.handleMouseUp(endEvent)

      expect(syncManager.updateNodePosition).toHaveBeenCalledWith('node-1', 200, 200)
      expect(syncManager.batchUpdatePositions).not.toHaveBeenCalled()
    })

    it('calls batchUpdatePositions for multi-node drag', async () => {
      const parent = new Node({ clientId: 'parent', type: 'condition', position: { x: 100, y: 100 } })
      const child = new Node({ clientId: 'child', type: 'action', position: { x: 200, y: 150 } })
      const conn = new Connection({ clientId: 'conn', sourceId: 'parent', targetId: 'child' })
      store.addNode(parent)
      store.addNode(child)
      store.addConnection(conn)

      // Start drag (without Shift)
      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'parent', mockElement)

      // Move
      const moveEvent = { clientX: 200, clientY: 200 }
      dragHandler.handleMouseMove(moveEvent)

      // End drag
      const endEvent = {}
      dragHandler.handleMouseUp(endEvent)

      expect(syncManager.batchUpdatePositions).toHaveBeenCalledWith(
        [
          { clientId: 'parent', x: 200, y: 200 },
          { clientId: 'child', x: 300, y: 250 }
        ],
        'Move condition node (+ 1 descendants)'
      )
      expect(syncManager.updateNodePosition).not.toHaveBeenCalled()
    })

    it('includes descendant count in description', async () => {
      const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
      const parent = new Node({ clientId: 'parent', type: 'condition', position: { x: 100, y: 100 } })
      const child1 = new Node({ clientId: 'child1', type: 'action', position: { x: 200, y: 100 } })
      const child2 = new Node({ clientId: 'child2', type: 'action', position: { x: 200, y: 200 } })
      const conn1 = new Connection({ clientId: 'c1', sourceId: 'root', targetId: 'parent' })
      const conn2 = new Connection({ clientId: 'c2', sourceId: 'parent', targetId: 'child1' })
      const conn3 = new Connection({ clientId: 'c3', sourceId: 'parent', targetId: 'child2' })
      store.addNode(root)
      store.addNode(parent)
      store.addNode(child1)
      store.addNode(child2)
      store.addConnection(conn1)
      store.addConnection(conn2)
      store.addConnection(conn3)

      // Start drag (without Shift)
      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'parent', mockElement)

      // Move
      const moveEvent = { clientX: 200, clientY: 200 }
      dragHandler.handleMouseMove(moveEvent)

      // End drag
      const endEvent = {}
      dragHandler.handleMouseUp(endEvent)

      expect(syncManager.batchUpdatePositions).toHaveBeenCalledWith(
        expect.arrayContaining([
          { clientId: 'parent', x: 200, y: 200 }
        ]),
        'Move condition node (+ 2 descendants)'
      )
    })
  })

  describe('cancelDrag', () => {
    it('restores dragged node position', () => {
      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      // Start drag
      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'node-1', mockElement)

      // Move
      const moveEvent = { clientX: 200, clientY: 200 }
      dragHandler.handleMouseMove(moveEvent)

      // Cancel
      dragHandler.cancelDrag()

      const restoredNode = store.getNode('node-1')
      expect(restoredNode.position.x).toBe(100)
      expect(restoredNode.position.y).toBe(100)
    })

    it('restores descendant positions', () => {
      const parent = new Node({ clientId: 'parent', type: 'condition', position: { x: 100, y: 100 } })
      const child = new Node({ clientId: 'child', type: 'action', position: { x: 200, y: 150 } })
      const conn = new Connection({ clientId: 'conn', sourceId: 'parent', targetId: 'child' })
      store.addNode(parent)
      store.addNode(child)
      store.addConnection(conn)

      // Start drag (without Shift)
      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'parent', mockElement)

      // Move
      const moveEvent = { clientX: 200, clientY: 200 }
      dragHandler.handleMouseMove(moveEvent)

      // Cancel
      dragHandler.cancelDrag()

      const restoredParent = store.getNode('parent')
      const restoredChild = store.getNode('child')
      expect(restoredParent.position.x).toBe(100)
      expect(restoredParent.position.y).toBe(100)
      expect(restoredChild.position.x).toBe(200)
      expect(restoredChild.position.y).toBe(150)
    })

    it('clears drag state', () => {
      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'node-1', mockElement)

      dragHandler.cancelDrag()

      expect(dragHandler.isDragging).toBe(false)
      expect(dragHandler.draggedClientId).toBe(null)
      expect(dragHandler.startPosition).toBe(null)
    })
  })

  describe('isCurrentlyDragging', () => {
    it('returns drag state', () => {
      expect(dragHandler.isCurrentlyDragging()).toBe(false)

      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'node-1', mockElement)

      expect(dragHandler.isCurrentlyDragging()).toBe(true)
    })
  })

  describe('getDraggedNodeId', () => {
    it('returns dragged node ID during drag', () => {
      const node = new Node({ clientId: 'node-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      const startEvent = {
        button: 0,
        target: { classList: { contains: vi.fn(() => false) } },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      }
      dragHandler.handleMouseDown(startEvent, 'node-1', mockElement)

      expect(dragHandler.getDraggedNodeId()).toBe('node-1')
    })

    it('returns null when not dragging', () => {
      expect(dragHandler.getDraggedNodeId()).toBe(null)
    })
  })
})