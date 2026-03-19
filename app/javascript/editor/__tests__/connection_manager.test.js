import { describe, it, expect, beforeEach, vi } from 'vitest';
import ConnectionManager from '../connection_manager.js';

describe('ConnectionManager', () => {
  let connectionManager;
  let mockConnectionsCanvas;
  let mockApi;
  let mockNodes;
  let mockScreenToCanvas;

  beforeEach(() => {
    mockConnectionsCanvas = {
      querySelectorAll: vi.fn()
    };
    
    mockApi = {
      botId: 1
    };
    
    mockNodes = new Map();
    
    mockScreenToCanvas = vi.fn((x, y) => ({ x, y }));

    connectionManager = new ConnectionManager(
      mockApi,
      mockNodes,
      mockScreenToCanvas
    );
    
    // Replace the connectionsCanvas with our mock
    connectionManager.connectionsCanvas = mockConnectionsCanvas;
  });

  // Helper to add a connection directly to the Map (bypassing drawConnection)
  const addConnectionToMap = (sourceId, targetId, connectionId = `conn-${sourceId}-${targetId}`) => {
    connectionManager.connections.set(`${sourceId}-${targetId}`, {
      sourceId,
      targetId,
      connectionId,
      line: {},
      hitArea: {},
      deleteBtn: {}
    });
  };

  describe('getDescendantNodeIds', () => {
    it('returns empty set for node with no outgoing connections', () => {
      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set());
    });

    it('returns direct children of a node', () => {
      addConnectionToMap(1, 2);
      addConnectionToMap(1, 3);

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set([2, 3]));
    });

    it('returns all descendants including grandchildren', () => {
      addConnectionToMap(1, 2);
      addConnectionToMap(2, 3);

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set([2, 3]));
    });

    it('handles DAG where node has multiple parents', () => {
      addConnectionToMap(1, 3);
      addConnectionToMap(2, 3);

      const fromNode1 = connectionManager.getDescendantNodeIds(1);
      const fromNode2 = connectionManager.getDescendantNodeIds(2);
      
      expect(fromNode1).toEqual(new Set([3]));
      expect(fromNode2).toEqual(new Set([3]));
    });

    it('does not include the start node in results', () => {
      addConnectionToMap(1, 1); // Self-reference

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set());
      expect(result.has(1)).toBe(false);
    });

    it('handles complex branching trees', () => {
      //     1
      //    / \
      //   2   3
      //  /     \
      // 4       5
      addConnectionToMap(1, 2);
      addConnectionToMap(1, 3);
      addConnectionToMap(2, 4);
      addConnectionToMap(3, 5);

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set([2, 3, 4, 5]));
    });

    it('ignores self-referencing connections', () => {
      addConnectionToMap(1, 1);

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set());
    });
  });

  describe('removeConnectionsForNode', () => {
    it('removes connections where node is source', () => {
      addConnectionToMap(1, 2);
      addConnectionToMap(1, 3);
      addConnectionToMap(2, 4);

      connectionManager.removeConnectionsForNode(1);

      expect(connectionManager.connections.has('1-2')).toBe(false);
      expect(connectionManager.connections.has('1-3')).toBe(false);
      expect(connectionManager.connections.has('2-4')).toBe(true);
    });

    it('removes connections where node is target', () => {
      addConnectionToMap(1, 2);
      addConnectionToMap(3, 2);
      addConnectionToMap(2, 4);

      connectionManager.removeConnectionsForNode(2);

      expect(connectionManager.connections.has('1-2')).toBe(false);
      expect(connectionManager.connections.has('3-2')).toBe(false);
      expect(connectionManager.connections.has('2-4')).toBe(false);
    });

    it('handles empty connections Map', () => {
      connectionManager.removeConnectionsForNode(1);
      expect(connectionManager.connections.size).toBe(0);
    });
  });

  describe('getConnections', () => {
    it('returns empty array when no connections', () => {
      expect(connectionManager.getConnections()).toEqual([]);
    });

    it('returns array of connection objects', () => {
      addConnectionToMap(1, 2, 'conn-1');
      addConnectionToMap(3, 4, 'conn-2');

      const connections = connectionManager.getConnections();
      
      expect(connections).toHaveLength(2);
      expect(connections).toContainEqual({
        source_node_id: 1,
        target_node_id: 2,
        connection_id: 'conn-1'
      });
      expect(connections).toContainEqual({
        source_node_id: 3,
        target_node_id: 4,
        connection_id: 'conn-2'
      });
    });
  });

  describe('removeConnection', () => {
    it('removes connection from Map', () => {
      addConnectionToMap(1, 2);

      connectionManager.removeConnection(1, 2);

      expect(connectionManager.connections.has('1-2')).toBe(false);
    });

    it('does nothing if connection does not exist', () => {
      connectionManager.removeConnection(1, 2);
      expect(connectionManager.connections.size).toBe(0);
    });
  });
});