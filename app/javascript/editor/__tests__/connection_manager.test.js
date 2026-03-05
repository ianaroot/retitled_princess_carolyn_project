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

  describe('getDescendantNodeIds', () => {
    const createMockLine = (sourceId, targetId) => ({
      dataset: { 
        sourceId: String(sourceId), 
        targetId: String(targetId),
        connectionId: `conn-${sourceId}-${targetId}`
      }
    });

    it('returns empty set for node with no outgoing connections', () => {
      mockConnectionsCanvas.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'line[data-source-id="1"]') {
          return [];
        }
        return [];
      });

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set());
    });

    it('returns direct children of a node', () => {
      mockConnectionsCanvas.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'line[data-source-id="1"]') {
          return [
            createMockLine(1, 2),
            createMockLine(1, 3)
          ];
        }
        if (selector === 'line[data-source-id="2"]') return [];
        if (selector === 'line[data-source-id="3"]') return [];
        return [];
      });

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set([2, 3]));
    });

    it('returns all descendants including grandchildren', () => {
      mockConnectionsCanvas.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'line[data-source-id="1"]') {
          return [createMockLine(1, 2)];
        }
        if (selector === 'line[data-source-id="2"]') {
          return [createMockLine(2, 3)];
        }
        if (selector === 'line[data-source-id="3"]') return [];
        return [];
      });

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set([2, 3]));
    });

    it('handles DAG where node has multiple parents', () => {
      mockConnectionsCanvas.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'line[data-source-id="1"]') {
          return [createMockLine(1, 3)];
        }
        if (selector === 'line[data-source-id="2"]') {
          return [createMockLine(2, 3)];
        }
        if (selector === 'line[data-source-id="3"]') return [];
        return [];
      });

      const fromNode1 = connectionManager.getDescendantNodeIds(1);
      const fromNode2 = connectionManager.getDescendantNodeIds(2);
      
      expect(fromNode1).toEqual(new Set([3]));
      expect(fromNode2).toEqual(new Set([3]));
    });

    it('does not include the start node in results', () => {
      mockConnectionsCanvas.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'line[data-source-id="1"]') {
          return [createMockLine(1, 1)]; // Self-reference
        }
        return [];
      });

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
      mockConnectionsCanvas.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'line[data-source-id="1"]') {
          return [createMockLine(1, 2), createMockLine(1, 3)];
        }
        if (selector === 'line[data-source-id="2"]') {
          return [createMockLine(2, 4)];
        }
        if (selector === 'line[data-source-id="3"]') {
          return [createMockLine(3, 5)];
        }
        if (selector === 'line[data-source-id="4"]') return [];
        if (selector === 'line[data-source-id="5"]') return [];
        return [];
      });

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set([2, 3, 4, 5]));
    });

    it('ignores self-referencing connections', () => {
      mockConnectionsCanvas.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'line[data-source-id="1"]') {
          return [createMockLine(1, 1)];
        }
        return [];
      });

      const result = connectionManager.getDescendantNodeIds(1);
      expect(result).toEqual(new Set());
    });
  });
});
