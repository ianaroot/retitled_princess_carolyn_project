import { describe, it, expect, beforeEach, vi } from 'vitest'
import Store from '../state/Store.js'
import Node from '../models/Node.js'
import Connection from '../models/Connection.js'
import Graph from '../models/Graph.js'
import { EVENTS } from '../constants.js'

describe('Store', () => {
  let store

  beforeEach(() => {
    store = new Store()
  })

  describe('constructor', () => {
    it('initializes with empty graph', () => {
      expect(store.getNodes()).toHaveLength(0)
      expect(store.getConnections()).toHaveLength(0)
      expect(store.destroyed).toBe(false)
    })

    it('initializes with default view state', () => {
      expect(store.viewState.zoom).toBe(1)
      expect(store.viewState.panX).toBe(0)
      expect(store.viewState.panY).toBe(0)
      expect(store.viewState.selectedNodeId).toBe(null)
      expect(store.viewState.editingNodeId).toBe(null)
    })
  })

  describe('node operations', () => {
    describe('addNode', () => {
      it('adds a node to the store', () => {
        const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
        store.addNode(node)

        expect(store.getNodes()).toHaveLength(1)
        expect(store.getNode('test-1')).toBe(node)
      })

      it('emits NODE_ADD event', () => {
        const callback = vi.fn()
        store.subscribe(callback)

        const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
        store.addNode(node)

        expect(callback).toHaveBeenCalledWith(EVENTS.NODE_ADD, expect.objectContaining({
          node,
          clientId: 'test-1'
        }))
      })

      it('throws if not a Node instance', () => {
        expect(() => store.addNode({ clientId: 'test' })).toThrow('addNode requires a Node instance')
      })
    })

    describe('updateNode', () => {
      it('updates node position', () => {
        const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
        store.addNode(node)

        store.updateNode('test-1', { position: { x: 200, y: 200 } })

        const updated = store.getNode('test-1')
        expect(updated.position.x).toBe(200)
        expect(updated.position.y).toBe(200)
      })

      it('updates node data', () => {
        const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 }, data: { foo: 'bar' } })
        store.addNode(node)

        store.updateNode('test-1', { data: { foo: 'baz', new: 'value' } })

        const updated = store.getNode('test-1')
        expect(updated.data.foo).toBe('baz')
        expect(updated.data.new).toBe('value')
      })

      it('emits NODE_UPDATE event', () => {
        const callback = vi.fn()
        store.subscribe(callback)

        const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
        store.addNode(node)
        callback.mockClear()

        store.updateNode('test-1', { position: { x: 200, y: 200 } })

        expect(callback).toHaveBeenCalledWith(EVENTS.NODE_UPDATE, expect.objectContaining({
          clientId: 'test-1',
          updates: { position: { x: 200, y: 200 } }
        }))
      })

      it('warns if node not found', () => {
        const consoleSpy = vi.spyOn(console, 'warn')
        store.updateNode('nonexistent', { position: { x: 0, y: 0 } })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
      })
    })

    describe('removeNode', () => {
      it('removes a node from the store', () => {
        const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
        store.addNode(node)

        store.removeNode('test-1')

        expect(store.getNodes()).toHaveLength(0)
        expect(store.getNode('test-1')).toBeUndefined()
      })

      it('emits NODE_REMOVE event', () => {
        const callback = vi.fn()
        store.subscribe(callback)

        const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
        store.addNode(node)
        callback.mockClear()

        store.removeNode('test-1')

        expect(callback).toHaveBeenCalledWith(EVENTS.NODE_REMOVE, expect.objectContaining({
          clientId: 'test-1'
        }))
      })

      it('cascade deletes connections', () => {
        const source = new Node({ clientId: 's1', type: 'root', position: { x: 0, y: 0 } })
        const target = new Node({ clientId: 't1', type: 'action', position: { x: 100, y: 100 } })
        const conn = new Connection({ clientId: 'c1', sourceId: 's1', targetId: 't1' })

        store.addNode(source)
        store.addNode(target)
        store.addConnection(conn)

        expect(store.getConnections()).toHaveLength(1)

        store.removeNode('t1')

        expect(store.getConnections()).toHaveLength(0)
      })

      it('emits CONNECTION_REMOVE for cascade deleted connections', () => {
        const callback = vi.fn()
        store.subscribe(callback)

        const source = new Node({ clientId: 's1', type: 'root', position: { x: 0, y: 0 } })
        const target = new Node({ clientId: 't1', type: 'action', position: { x: 100, y: 100 } })
        const conn = new Connection({ clientId: 'c1', sourceId: 's1', targetId: 't1' })

        store.addNode(source)
        store.addNode(target)
        store.addConnection(conn)
        callback.mockClear()

        store.removeNode('t1')

        expect(callback).toHaveBeenCalledWith(EVENTS.CONNECTION_REMOVE, expect.objectContaining({
          clientId: 'c1'
        }))
      })
    })

    describe('getNode', () => {
      it('returns node by clientId', () => {
        const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
        store.addNode(node)

        expect(store.getNode('test-1')).toBe(node)
      })

      it('returns undefined for non-existent node', () => {
        expect(store.getNode('nonexistent')).toBeUndefined()
      })
    })

    describe('getNodes', () => {
      it('returns array of all nodes', () => {
        const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
        const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })

        store.addNode(node1)
        store.addNode(node2)

        const nodes = store.getNodes()
        expect(nodes).toHaveLength(2)
        expect(nodes).toEqual(expect.arrayContaining([node1, node2]))
      })
    })
  })

  describe('connection operations', () => {
    beforeEach(() => {
      // Add required nodes for connections (Graph validates that nodes exist)
      const source = new Node({ clientId: 's1', type: 'root', position: { x: 0, y: 0 } })
      const target = new Node({ clientId: 't1', type: 'action', position: { x: 100, y: 100 } })
      store.addNode(source)
      store.addNode(target)
    })

    describe('addConnection', () => {
      it('adds a connection to the store', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 's1', targetId: 't1' })
        store.addConnection(conn)

        expect(store.getConnections()).toHaveLength(1)
        expect(store.getConnection('c1')).toBe(conn)
      })

      it('emits CONNECTION_ADD event', () => {
        const callback = vi.fn()
        store.subscribe(callback)

        const conn = new Connection({ clientId: 'c1', sourceId: 's1', targetId: 't1' })
        store.addConnection(conn)

        expect(callback).toHaveBeenCalledWith(EVENTS.CONNECTION_ADD, expect.objectContaining({
          connection: conn,
          clientId: 'c1'
        }))
      })

      it('throws if not a Connection instance', () => {
        expect(() => store.addConnection({ clientId: 'test' })).toThrow('addConnection requires a Connection instance')
      })
    })

    describe('removeConnection', () => {
      it('removes a connection from the store', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 's1', targetId: 't1' })
        store.addConnection(conn)

        store.removeConnection('c1')

        expect(store.getConnections()).toHaveLength(0)
      })

      it('emits CONNECTION_REMOVE event', () => {
        const callback = vi.fn()
        store.subscribe(callback)

        const conn = new Connection({ clientId: 'c1', sourceId: 's1', targetId: 't1' })
        store.addConnection(conn)
        callback.mockClear()

        store.removeConnection('c1')

        expect(callback).toHaveBeenCalledWith(EVENTS.CONNECTION_REMOVE, expect.objectContaining({
          clientId: 'c1'
        }))
      })
    })

    describe('findConnection', () => {
      it('finds connection between two nodes', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 's1', targetId: 't1' })
        store.addConnection(conn)

        expect(store.findConnection('s1', 't1')).toBe(conn)
      })

      it('returns undefined if no connection exists', () => {
        expect(store.findConnection('s1', 't1')).toBeUndefined()
      })
    })

    describe('getNodeConnections', () => {
      it('returns outgoing and incoming connections for a node', () => {
        // Use different IDs than beforeEach to avoid conflicts
        const source = new Node({ clientId: 'src', type: 'root', position: { x: 0, y: 0 } })
        const mid = new Node({ clientId: 'mid', type: 'condition', position: { x: 100, y: 100 } })
        const target = new Node({ clientId: 'tgt', type: 'action', position: { x: 200, y: 200 } })
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'src', targetId: 'mid' })
        const conn2 = new Connection({ clientId: 'c2', sourceId: 'mid', targetId: 'tgt' })

        store.addNode(source)
        store.addNode(mid)
        store.addNode(target)
        store.addConnection(conn1)
        store.addConnection(conn2)

        const { outgoing, incoming } = store.getNodeConnections('mid')

        expect(outgoing).toHaveLength(1)
        expect(outgoing[0]).toBe(conn2)
        expect(incoming).toHaveLength(1)
        expect(incoming[0]).toBe(conn1)
      })
    })
  })

  describe('subscriber pattern', () => {
    it('allows multiple subscribers', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      store.subscribe(callback1)
      store.subscribe(callback2)

      const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })

    it('supports unsubscribe', () => {
      const callback = vi.fn()
      const unsubscribe = store.subscribe(callback)

      const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)
      expect(callback).toHaveBeenCalledTimes(1)

      unsubscribe()

      const node2 = new Node({ clientId: 'test-2', type: 'action', position: { x: 200, y: 200 } })
      store.addNode(node2)
      expect(callback).toHaveBeenCalledTimes(1) // Still 1, not called again
    })

    it('prevents recursive emits', () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      // Recursive emit would cause infinite loop
      store.subscribe(() => {
        const node = new Node({ clientId: 'recursive', type: 'action', position: { x: 0, y: 0 } })
        store.addNode(node)
      })

      const node = new Node({ clientId: 'initial', type: 'action', position: { x: 0, y: 0 } })
      store.addNode(node)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Recursive emit prevented'))
    })
  })

  describe('destroy', () => {
    it('sets destroyed flag', () => {
      expect(store.destroyed).toBe(false)
      store.destroy()
      expect(store.destroyed).toBe(true)
    })

    it('clears subscribers', () => {
      const callback = vi.fn()
      store.subscribe(callback)

      store.destroy()

      const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      expect(callback).not.toHaveBeenCalled()
    })

    it('prevents emits after destroy', () => {
      const callback = vi.fn()
      store.subscribe(callback)

      store.destroy()

      const node = new Node({ clientId: 'test-1', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node)

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('state serialization', () => {
    it('serializes state with getState', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 }, data: { test: 'value' } })
      store.addNode(node)

      const state = store.getState()

      expect(state.graph).toBeDefined()
      expect(state.graph.nodes).toHaveLength(1)
    })

    it('restores state with restoreState', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node1)

      const state = store.getState()

      // Add another node
      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
      store.addNode(node2)

      expect(store.getNodes()).toHaveLength(2)

      // Restore to previous state
      store.restoreState(state)

      expect(store.getNodes()).toHaveLength(1)
      expect(store.getNode('n1')).toBeDefined()
    })

    it('emits GRAPH_RESTORE event on restoreState', () => {
      const callback = vi.fn()
      store.subscribe(callback)

      const state = store.getState()
      store.restoreState(state)

      expect(callback).toHaveBeenCalledWith(EVENTS.GRAPH_RESTORE, expect.objectContaining({
        graph: expect.anything()
      }))
    })
  })

  describe('replaceGraph', () => {
    it('replaces entire graph', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      store.addNode(node1)

      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
      const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
      const newGraph = new Graph([node2], [conn])

      store.replaceGraph(newGraph)

      expect(store.getNodes()).toHaveLength(1)
      expect(store.getNode('n1')).toBeUndefined()
      expect(store.getNode('n2')).toBeDefined()
    })

    it('emits GRAPH_REPLACE event', () => {
      const callback = vi.fn()
      store.subscribe(callback)

      const newGraph = new Graph([], [])
      store.replaceGraph(newGraph)

      expect(callback).toHaveBeenCalledWith(EVENTS.GRAPH_REPLACE, expect.objectContaining({
        graph: newGraph
      }))
    })
  })

  describe('view state', () => {
    it('sets and gets zoom', () => {
      store.setZoom(2)
      expect(store.viewState.zoom).toBe(2)
    })

    it('clamps zoom to valid range', () => {
      store.setZoom(10)
      expect(store.viewState.zoom).toBe(5)

      store.setZoom(0)
      expect(store.viewState.zoom).toBe(0.1)
    })

    it('sets and gets pan', () => {
      store.setPan(100, 200)
      expect(store.viewState.panX).toBe(100)
      expect(store.viewState.panY).toBe(200)
    })

    it('sets and gets selected node', () => {
      store.setSelectedNode('node-1')
      expect(store.getSelectedNode()).toBe('node-1')

      store.setSelectedNode(null)
      expect(store.getSelectedNode()).toBe(null)
    })

    it('sets and gets editing node', () => {
      store.setEditingNode('node-1')
      expect(store.getEditingNode()).toBe('node-1')

      store.setEditingNode(null)
      expect(store.getEditingNode()).toBe(null)
    })
    
  })
  describe('getNodesByType', () => {
  it('returns empty array when no nodes of type exist', () => {
    const root = new Node({ clientId: 'r1', type: 'root', position: { x: 0, y: 0 } })
    store.addNode(root)
    
    expect(store.getNodesByType('condition')).toHaveLength(0)
  })
  it('returns all nodes of a specific type', () => {
    const root = new Node({ clientId: 'r1', type: 'root', position: { x: 0, y: 0 } })
    const cond1 = new Node({ clientId: 'c1', type: 'condition', position: { x: 100, y: 100 } })
    const cond2 = new Node({ clientId: 'c2', type: 'condition', position: { x: 200, y: 200 } })
    
    store.addNode(root)
    store.addNode(cond1)
    store.addNode(cond2)
    
    const conditions = store.getNodesByType('condition')
    expect(conditions).toHaveLength(2)
    expect(conditions).toEqual(expect.arrayContaining([cond1, cond2]))
  })
  it('returns empty array for unknown type', () => {
    const root = new Node({ clientId: 'r1', type: 'root', position: { x: 0, y: 0 } })
    store.addNode(root)
    
    expect(store.getNodesByType('unknown')).toHaveLength(0)
  })
})
describe('getDescendantIds', () => {
  beforeEach(() => {
    //root -> condition -> action
    //               \-> action2
    const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
    const cond = new Node({ clientId: 'cond', type: 'condition', position: { x: 100, y: 100 } })
    const action1 = new Node({ clientId: 'action1', type: 'action', position: { x: 200, y: 100 } })
    const action2 = new Node({ clientId: 'action2', type: 'action', position: { x: 200, y: 200 } })
    
    store.addNode(root)
    store.addNode(cond)
    store.addNode(action1)
    store.addNode(action2)
    
    store.addConnection(new Connection({ clientId: 'c1', sourceId: 'root', targetId: 'cond' }))
    store.addConnection(new Connection({ clientId: 'c2', sourceId: 'cond', targetId: 'action1' }))
    store.addConnection(new Connection({ clientId: 'c3', sourceId: 'cond', targetId: 'action2' }))
  })
  it('returns empty set for node with no descendants', () => {
    const descendants = store.getDescendantIds('action1')
    expect(descendants.size).toBe(0)
  })
  it('returns direct children (one level deep)', () => {
    const descendants = store.getDescendantIds('root')
    expect(descendants.has('cond')).toBe(true)
    expect(descendants.size).toBe(3) // cond, action1, action2
  })
  it('returns all descendants (multiple levels)', () => {
    const descendants = store.getDescendantIds('root')
    expect(descendants.has('cond')).toBe(true)
    expect(descendants.has('action1')).toBe(true)
    expect(descendants.has('action2')).toBe(true)
  })
  it('handles branching correctly', () => {
    const descendants = store.getDescendantIds('cond')
    expect(descendants.has('action1')).toBe(true)
    expect(descendants.has('action2')).toBe(true)
    expect(descendants.has('root')).toBe(false) // Not a descendant
  })
  it('returns empty set for non-existent node', () => {
    const descendants = store.getDescendantIds('nonexistent')
    expect(descendants.size).toBe(0)
  })
})
  
})