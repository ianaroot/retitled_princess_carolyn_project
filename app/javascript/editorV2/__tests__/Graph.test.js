import { describe, it, expect, beforeEach, vi } from 'vitest'
import Graph from '../models/Graph.js'
import Node from '../models/Node.js'
import Connection from '../models/Connection.js'

describe('Graph', () => {
  let graph

  beforeEach(() => {
    graph = new Graph()
  })

  describe('constructor', () => {
    it('creates empty graph', () => {
      expect(graph.getNodes()).toHaveLength(0)
      expect(graph.getConnections()).toHaveLength(0)
    })

    it('creates graph with nodes', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })

      const graphWithNodes = new Graph([node1, node2])

      expect(graphWithNodes.getNodes()).toHaveLength(2)
      expect(graphWithNodes.getNode('n1')).toBe(node1)
      expect(graphWithNodes.getNode('n2')).toBe(node2)
    })

    it('creates graph with connections', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
      const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })

      const graphWithConn = new Graph([node1, node2], [conn])

      expect(graphWithConn.getConnections()).toHaveLength(1)
      expect(graphWithConn.getConnection('c1')).toBe(conn)
    })

    it('throws when non-Node instance passed', () => {
      expect(() => new Graph([{ clientId: 'n1' }])).toThrow('All nodes must be Node instances')
    })

    it('throws when non-Connection instance passed', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      expect(() => new Graph([node], [{ clientId: 'c1' }])).toThrow('All connections must be Connection instances')
    })
  })

  describe('node operations', () => {
    describe('getNode', () => {
      it('returns node by clientId', () => {
        const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
        graph = new Graph([node])

        expect(graph.getNode('n1')).toBe(node)
      })

      it('returns undefined for non-existent node', () => {
        expect(graph.getNode('nonexistent')).toBeUndefined()
      })
    })

    describe('hasNode', () => {
      it('returns true for existing node', () => {
        const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
        graph = new Graph([node])

        expect(graph.hasNode('n1')).toBe(true)
      })

      it('returns false for non-existent node', () => {
        expect(graph.hasNode('nonexistent')).toBe(false)
      })
    })

    describe('getNodes', () => {
      it('returns empty array for empty graph', () => {
        expect(graph.getNodes()).toEqual([])
      })

      it('returns array of all nodes', () => {
        const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
        const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 } })
        graph = new Graph([node1, node2])

        const nodes = graph.getNodes()
        expect(nodes).toHaveLength(2)
        expect(nodes).toEqual(expect.arrayContaining([node1, node2]))
      })
    })

    describe('getNodesByType', () => {
      beforeEach(() => {
        const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
        const cond1 = new Node({ clientId: 'cond1', type: 'condition', position: { x: 100, y: 100 } })
        const cond2 = new Node({ clientId: 'cond2', type: 'condition', position: { x: 200, y: 200 } })
        const action = new Node({ clientId: 'action1', type: 'action', position: { x: 300, y: 300 } })
        graph = new Graph([root, cond1, cond2, action])
      })

      it('returns nodes of specific type', () => {
        const conditions = graph.getNodesByType('condition')
        expect(conditions).toHaveLength(2)
        expect(conditions.every(n => n.type === 'condition')).toBe(true)
      })

      it('returns all nodes of type when multiple match', () => {
        const roots = graph.getNodesByType('root')
        expect(roots).toHaveLength(1)
        expect(roots[0].clientId).toBe('root')
      })

      it('returns empty array when no nodes of type exist', () => {
        const connectors = graph.getNodesByType('connector')
        expect(connectors).toHaveLength(0)
      })

      it('returns empty array for unknown type', () => {
        const unknown = graph.getNodesByType('unknown')
        expect(unknown).toHaveLength(0)
      })
    })

    describe('addNode', () => {
      it('returns new Graph with node added', () => {
        const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })

        const newGraph = graph.addNode(node)

        expect(newGraph).not.toBe(graph)
        expect(newGraph.getNodes()).toHaveLength(1)
        expect(newGraph.getNode('n1')).toBe(node)
      })

      it('preserves original graph immutability', () => {
        const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })

        graph.addNode(node)

        expect(graph.getNodes()).toHaveLength(0)
      })

      it('warns when replacing existing node', () => {
        const consoleSpy = vi.spyOn(console, 'warn')
        const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
        const node2 = new Node({ clientId: 'n1', type: 'condition', position: { x: 100, y: 100 } })
        graph = new Graph([node1])

        const newGraph = graph.addNode(node2)

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'))
        expect(newGraph.getNode('n1')).toBe(node2)
      })
    })

    describe('updateNode', () => {
      it('returns new Graph with updated node', () => {
        const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
        graph = new Graph([node])

        const newGraph = graph.updateNode('n1', { position: { x: 100, y: 100 } })

        expect(newGraph).not.toBe(graph)
        expect(newGraph.getNode('n1').position.x).toBe(100)
        expect(newGraph.getNode('n1').position.y).toBe(100)
      })

      it('returns same Graph when node not found', () => {
        const consoleSpy = vi.spyOn(console, 'warn')

        const newGraph = graph.updateNode('nonexistent', { position: { x: 0, y: 0 } })

        expect(newGraph).toBe(graph)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
      })
    })

    describe('removeNode', () => {
      it('returns new Graph with node removed', () => {
        const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
        graph = new Graph([node])

        const newGraph = graph.removeNode('n1')

        expect(newGraph).not.toBe(graph)
        expect(newGraph.getNodes()).toHaveLength(0)
      })

      it('cascade deletes connections when node removed', () => {
        const source = new Node({ clientId: 's1', type: 'root', position: { x: 0, y: 0 } })
        const target = new Node({ clientId: 't1', type: 'action', position: { x: 100, y: 100 } })
        const conn = new Connection({ clientId: 'c1', sourceId: 's1', targetId: 't1' })
        graph = new Graph([source, target], [conn])

        const newGraph = graph.removeNode('s1')

        expect(newGraph.getConnections()).toHaveLength(0)
      })

      it('returns same Graph when node not found', () => {
        const consoleSpy = vi.spyOn(console, 'warn')

        const newGraph = graph.removeNode('nonexistent')

        expect(newGraph).toBe(graph)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
      })
    })
  })

  describe('connection operations', () => {
    beforeEach(() => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      const node2 = new Node({ clientId: 'n2', type: 'action', position: { x: 100, y: 100 } })
      graph = new Graph([node1, node2])
    })

    describe('getConnection', () => {
      it('returns connection by clientId', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        graph = new Graph(graph.getNodes(), [conn])

        expect(graph.getConnection('c1')).toBe(conn)
      })

      it('returns undefined for non-existent connection', () => {
        expect(graph.getConnection('nonexistent')).toBeUndefined()
      })
    })

    describe('hasConnection', () => {
      it('returns true for existing connection', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        graph = new Graph(graph.getNodes(), [conn])

        expect(graph.hasConnection('c1')).toBe(true)
      })

      it('returns false for non-existent connection', () => {
        expect(graph.hasConnection('nonexistent')).toBe(false)
      })
    })

    describe('getConnections', () => {
      it('returns empty array for empty graph', () => {
        expect(graph.getConnections()).toEqual([])
      })

      it('returns array of all connections', () => {
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        const node3 = new Node({ clientId: 'n3', type: 'action', position: { x: 200, y: 200 } })
        graph = new Graph([...graph.getNodes(), node3], [conn1])
        const conn2 = new Connection({ clientId: 'c2', sourceId: 'n1', targetId: 'n3' })
        graph = new Graph(graph.getNodes(), [conn1, conn2])

        const connections = graph.getConnections()
        expect(connections).toHaveLength(2)
        expect(connections).toEqual(expect.arrayContaining([conn1, conn2]))
      })
    })

    describe('findConnection', () => {
      it('finds connection by source and target', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        graph = new Graph(graph.getNodes(), [conn])

        expect(graph.findConnection('n1', 'n2')).toBe(conn)
      })

      it('returns undefined when no connection exists', () => {
        expect(graph.findConnection('n1', 'n2')).toBeUndefined()
      })

      it('does not find reverse connection', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        graph = new Graph(graph.getNodes(), [conn])

        expect(graph.findConnection('n2', 'n1')).toBeUndefined()
      })
    })

    describe('getNodeConnections', () => {
      it('returns outgoing and incoming connections', () => {
        const node3 = new Node({ clientId: 'n3', type: 'action', position: { x: 200, y: 200 } })
        graph = new Graph([...graph.getNodes(), node3])
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        const conn2 = new Connection({ clientId: 'c2', sourceId: 'n2', targetId: 'n3' })
        graph = new Graph(graph.getNodes(), [conn1, conn2])

        const { outgoing, incoming } = graph.getNodeConnections('n2')

        expect(outgoing).toHaveLength(1)
        expect(outgoing[0]).toBe(conn2)
        expect(incoming).toHaveLength(1)
        expect(incoming[0]).toBe(conn1)
      })

      it('returns empty arrays for node with no connections', () => {
        const { outgoing, incoming } = graph.getNodeConnections('n1')
        expect(outgoing).toHaveLength(0)
        expect(incoming).toHaveLength(0)
      })
    })

    describe('getOutgoingConnections', () => {
      it('returns only outgoing connections', () => {
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        const conn2 = new Connection({ clientId: 'c2', sourceId: 'n2', targetId: 'n1' })
        graph = new Graph(graph.getNodes(), [conn1, conn2])

        const outgoing = graph.getOutgoingConnections('n1')
        expect(outgoing).toHaveLength(1)
        expect(outgoing[0]).toBe(conn1)
      })
    })

    describe('getIncomingConnections', () => {
      it('returns only incoming connections', () => {
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        const conn2 = new Connection({ clientId: 'c2', sourceId: 'n2', targetId: 'n1' })
        graph = new Graph(graph.getNodes(), [conn1, conn2])

        const incoming = graph.getIncomingConnections('n1')
        expect(incoming).toHaveLength(1)
        expect(incoming[0]).toBe(conn2)
      })
    })

    describe('getDescendantIds', () => {
      beforeEach(() => {
        const root = new Node({ clientId: 'root', type: 'root', position: { x: 0, y: 0 } })
        const cond = new Node({ clientId: 'cond', type: 'condition', position: { x: 100, y: 100 } })
        const action1 = new Node({ clientId: 'action1', type: 'action', position: { x: 200, y: 100 } })
        const action2 = new Node({ clientId: 'action2', type: 'action', position: { x: 200, y: 200 } })
        graph = new Graph([root, cond, action1, action2])
      })

      it('returns empty set for leaf node', () => {
        const descendants = graph.getDescendantIds('action1')
        expect(descendants.size).toBe(0)
      })

      it('returns empty set for nonexistent node', () => {
        const descendants = graph.getDescendantIds('nonexistent')
        expect(descendants.size).toBe(0)
      })

      it('returns direct children', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 'root', targetId: 'cond' })
        graph = new Graph(graph.getNodes(), [conn])

        const descendants = graph.getDescendantIds('root')
        expect(descendants.size).toBe(1)
        expect(descendants.has('cond')).toBe(true)
      })

      it('returns all descendants multiple levels deep', () => {
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'root', targetId: 'cond' })
        const conn2 = new Connection({ clientId: 'c2', sourceId: 'cond', targetId: 'action1' })
        const conn3 = new Connection({ clientId: 'c3', sourceId: 'cond', targetId: 'action2' })
        graph = new Graph(graph.getNodes(), [conn1, conn2, conn3])

        const descendants = graph.getDescendantIds('root')
        expect(descendants.size).toBe(3)
        expect(descendants.has('cond')).toBe(true)
        expect(descendants.has('action1')).toBe(true)
        expect(descendants.has('action2')).toBe(true)
      })

      it('handles branching correctly', () => {
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'root', targetId: 'cond' })
        const conn2 = new Connection({ clientId: 'c2', sourceId: 'cond', targetId: 'action1' })
        const conn3 = new Connection({ clientId: 'c3', sourceId: 'cond', targetId: 'action2' })
        graph = new Graph(graph.getNodes(), [conn1, conn2, conn3])

        const descendants = graph.getDescendantIds('cond')
        expect(descendants.has('action1')).toBe(true)
        expect(descendants.has('action2')).toBe(true)
        expect(descendants.has('root')).toBe(false)
      })

      it('handles cycles without infinite loop', () => {
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        const conn2 = new Connection({ clientId: 'c2', sourceId: 'n2', targetId: 'n1' })
        graph = new Graph(graph.getNodes(), [conn1, conn2])

        const descendants = graph.getDescendantIds('n1')
        expect(descendants.has('n2')).toBe(true)
      })
    })

    describe('addConnection', () => {
      it('returns new Graph with connection added', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })

        const newGraph = graph.addConnection(conn)

        expect(newGraph).not.toBe(graph)
        expect(newGraph.getConnections()).toHaveLength(1)
        expect(newGraph.getConnection('c1')).toBe(conn)
      })

      it('warns when source node does not exist', () => {
        const consoleSpy = vi.spyOn(console, 'warn')
        const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
        graph = new Graph([node1])
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })

        const newGraph = graph.addConnection(conn)

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Target node'))
        expect(newGraph).toBe(graph)
      })

      it('warns when target node does not exist', () => {
        const consoleSpy = vi.spyOn(console, 'warn')
        const node2 = new Node({ clientId: 'n2', type: 'action', position: { x: 100, y: 100 } })
        graph = new Graph([node2])
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })

        const newGraph = graph.addConnection(conn)

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Source node'))
        expect(newGraph).toBe(graph)
      })

      it('prevents duplicate connections', () => {
        const consoleSpy = vi.spyOn(console, 'warn')
        const conn1 = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        graph = new Graph(graph.getNodes(), [conn1])

        const conn2 = new Connection({ clientId: 'c2', sourceId: 'n1', targetId: 'n2' })
        const newGraph = graph.addConnection(conn2)

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'))
        expect(newGraph).toBe(graph)
      })
    })

    describe('updateConnection', () => {
      it('returns new Graph with updated connection', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        graph = new Graph(graph.getNodes(), [conn])

        const newGraph = graph.updateConnection('c1', { serverId: 123 })

        expect(newGraph).not.toBe(graph)
        expect(newGraph.getConnection('c1').serverId).toBe(123)
      })

      it('returns same Graph when connection not found', () => {
        const consoleSpy = vi.spyOn(console, 'warn')

        const newGraph = graph.updateConnection('nonexistent', {})

        expect(newGraph).toBe(graph)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
      })
    })

    describe('removeConnection', () => {
      it('returns new Graph with connection removed', () => {
        const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
        graph = new Graph(graph.getNodes(), [conn])

        const newGraph = graph.removeConnection('c1')

        expect(newGraph).not.toBe(graph)
        expect(newGraph.getConnections()).toHaveLength(0)
      })

      it('returns same Graph when connection not found', () => {
        const consoleSpy = vi.spyOn(console, 'warn')

        const newGraph = graph.removeConnection('nonexistent')

        expect(newGraph).toBe(graph)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
      })
    })
  })

  describe('serialization', () => {
    it('serializes to JSON', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 }, data: { foo: 'bar' } })
      const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
      graph = new Graph([node], [conn])

      const json = graph.toJSON()

      expect(json.nodes).toHaveLength(1)
      expect(json.connections).toHaveLength(1)
      expect(json.nodes[0].clientId).toBe('n1')
    })

    it('deserializes from JSON', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
      const originalGraph = new Graph([node], [conn])

      const json = originalGraph.toJSON()
      const restoredGraph = Graph.fromJSON(json)

      expect(restoredGraph.getNodes()).toHaveLength(1)
      expect(restoredGraph.getConnections()).toHaveLength(1)
      expect(restoredGraph.getNode('n1').type).toBe('root')
    })

    it('round-trips correctly', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      const node2 = new Node({ clientId: 'n2', type: 'condition', position: { x: 100, y: 100 }, data: { foo: 'bar' } })
      const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
      const originalGraph = new Graph([node1, node2], [conn])

      const json = originalGraph.toJSON()
      const restoredGraph = Graph.fromJSON(json)

      expect(restoredGraph.getNodes()).toHaveLength(2)
      expect(restoredGraph.getConnections()).toHaveLength(1)
      expect(restoredGraph.findConnection('n1', 'n2')).toBeDefined()
    })
  })

  describe('utility methods', () => {
    it('getSize returns node and connection counts', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      const node2 = new Node({ clientId: 'n2', type: 'action', position: { x: 100, y: 100 } })
      const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
      graph = new Graph([node1, node2], [conn])

      const size = graph.getSize()

      expect(size.nodes).toBe(2)
      expect(size.connections).toBe(1)
    })

    it('isEmpty returns true for empty graph', () => {
      expect(graph.isEmpty()).toBe(true)
    })

    it('isEmpty returns false for graph with nodes', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      graph = new Graph([node])

      expect(graph.isEmpty()).toBe(false)
    })

    it('clone creates deep copy', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      graph = new Graph([node])

      const clone = graph.clone()

      expect(clone).not.toBe(graph)
      expect(clone.getNode('n1')).not.toBe(node)
      expect(clone.getNode('n1').clientId).toBe('n1')
    })
  })

  describe('immutability', () => {
    it('addNode returns new Graph instance', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })

      const newGraph = graph.addNode(node)

      expect(newGraph).not.toBe(graph)
      expect(graph.getNodes()).toHaveLength(0)
    })

    it('addConnection returns new Graph instance', () => {
      const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      const node2 = new Node({ clientId: 'n2', type: 'action', position: { x: 100, y: 100 } })
      const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
      graph = new Graph([node1, node2])

      const newGraph = graph.addConnection(conn)

      expect(newGraph).not.toBe(graph)
      expect(graph.getConnections()).toHaveLength(0)
    })

    it('updateNode returns new Graph instance', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      graph = new Graph([node])

      const newGraph = graph.updateNode('n1', { position: { x: 100, y: 100 } })

      expect(newGraph).not.toBe(graph)
      expect(graph.getNode('n1').position.x).toBe(0)
    })

    it('removeNode returns new Graph instance', () => {
      const node = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
      graph = new Graph([node])

      const newGraph = graph.removeNode('n1')

      expect(newGraph).not.toBe(graph)
      expect(graph.getNodes()).toHaveLength(1)
    })
  })
})