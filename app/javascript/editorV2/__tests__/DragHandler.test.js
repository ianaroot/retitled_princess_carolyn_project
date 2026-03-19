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

  describe('cancelDrag', () => {
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