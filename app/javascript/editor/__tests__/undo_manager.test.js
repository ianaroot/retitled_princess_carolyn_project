import { describe, it, expect, beforeEach, vi } from 'vitest';
import UndoManager from '../undo_manager.js';

describe('UndoManager', () => {
  let undoManager;
  let mockNodeEditor;

  beforeEach(() => {
    // Create minimal DOM elements
    const mockConnectionsCanvas = document.createElement('svg');
    
    // Create mock nodes
    const mockNodes = new Map([
      [1, { 
        element: document.createElement('div'), 
        type: 'condition', 
        position: { x: 100, y: 100 }, 
        data: { condition: 'has_moved' }
      }],
      [2, { 
        element: document.createElement('div'), 
        type: 'action', 
        position: { x: 200, y: 200 }, 
        data: { action_type: 'move' }
      }]
    ]);

    mockNodeEditor = {
      nodes: mockNodes,
      connectionsCanvas: mockConnectionsCanvas,
      api: {
        batchUpdatePositions: vi.fn().mockResolvedValue(true),
        deleteNode: vi.fn().mockResolvedValue(true),
        createNode: vi.fn().mockResolvedValue({ id: 999, node_type: 'condition', position_x: 100, position_y: 100 }),
        updateNodePosition: vi.fn().mockResolvedValue(true),
        deleteConnection: vi.fn().mockResolvedValue(true),
        createConnection: vi.fn().mockResolvedValue({ id: 888 }),
        getNodePreviewHtml: vi.fn().mockResolvedValue('<div>Preview</div>')
      },
      connectionManager: {
        drawConnection: vi.fn(),
        updateConnections: vi.fn()
      },
      renderNode: vi.fn((nodeData) => {
        const el = document.createElement('div');
        mockNodeEditor.nodes.set(nodeData.id, {
          element: el,
          type: nodeData.node_type,
          position: { x: nodeData.position_x, y: nodeData.position_y },
          data: nodeData.data || {}
        });
        return el;
      }),
      updateUndoUI: vi.fn()
    };

    undoManager = new UndoManager(mockNodeEditor);
  });

  describe('constructor', () => {
    it('initializes with empty history and index -1', () => {
      const um = new UndoManager(mockNodeEditor);
      
      expect(um.history).toHaveLength(0);
      expect(um.currentIndex).toBe(-1);
      expect(um.maxHistory).toBe(25);
      expect(um.isUndoing).toBe(false);
      expect(um.nodeEditor).toBe(mockNodeEditor);
    });
  });

  describe('pushState', () => {
    it('captures current nodes and connections', () => {
      undoManager.pushState('Test action');
      
      expect(undoManager.history).toHaveLength(1);
      const state = undoManager.history[0];
      
      expect(state).toHaveProperty('timestamp');
      expect(state.description).toBe('Test action');
      expect(state.nodes).toHaveLength(2);
      expect(state.nodes[0]).toMatchObject({
        id: 1,
        node_type: 'condition',
        position_x: 100,
        position_y: 100
      });
      expect(state.nodes[1]).toMatchObject({
        id: 2,
        node_type: 'action',
        position_x: 200,
        position_y: 200
      });
      expect(Array.isArray(state.connections)).toBe(true);
    });

    it('increments currentIndex after push', () => {
      expect(undoManager.currentIndex).toBe(-1);
      
      undoManager.pushState('First state');
      expect(undoManager.currentIndex).toBe(0);
      
      undoManager.pushState('Second state');
      expect(undoManager.currentIndex).toBe(1);
      
      undoManager.pushState('Third state');
      expect(undoManager.currentIndex).toBe(2);
    });

    it('removes oldest state when exceeding maxHistory', () => {
      // Override maxHistory to 3 for testing
      undoManager.maxHistory = 3;
      
      undoManager.pushState('State 1');
      undoManager.pushState('State 2');
      undoManager.pushState('State 3');
      
      expect(undoManager.history).toHaveLength(3);
      expect(undoManager.currentIndex).toBe(2);
      expect(undoManager.history[0].description).toBe('State 1');
      
      // Push 4th state - should remove oldest
      undoManager.pushState('State 4');
      
      expect(undoManager.history).toHaveLength(3);
      expect(undoManager.currentIndex).toBe(2);
      expect(undoManager.history[0].description).toBe('State 2');
      expect(undoManager.history[1].description).toBe('State 3');
      expect(undoManager.history[2].description).toBe('State 4');
    });
  });

  describe('pushDragState', () => {
    it('captures pre and post drag positions along with full state', () => {
      const preDragPositions = [{ id: 1, x: 100, y: 100 }];
      const postDragPositions = [{ id: 1, x: 200, y: 200 }];
      
      undoManager.pushDragState('Drag node', preDragPositions, postDragPositions);
      
      expect(undoManager.history).toHaveLength(1);
      const state = undoManager.history[0];
      
      expect(state.description).toBe('Drag node');
      expect(state.preDragPositions).toEqual(preDragPositions);
      expect(state.postDragPositions).toEqual(postDragPositions);
      expect(state.nodes).toHaveLength(2);
      expect(state.nodes[0].id).toBe(1);
      expect(Array.isArray(state.connections)).toBe(true);
    });
  });

  describe('undo', () => {
    it('does nothing when canUndo returns false', async () => {
      // Start with empty history
      expect(undoManager.currentIndex).toBe(-1);
      expect(undoManager.canUndo()).toBe(false);
      
      const initialHistory = [...undoManager.history];
      
      await undoManager.undo();
      
      // State should be unchanged
      expect(undoManager.currentIndex).toBe(-1);
      expect(undoManager.history).toEqual(initialHistory);
      expect(mockNodeEditor.api.batchUpdatePositions).not.toHaveBeenCalled();
    });

    it('decrements currentIndex and calls restoreFullState', async () => {
      // Spy on restoreFullState
      const restoreSpy = vi.spyOn(undoManager, 'restoreFullState').mockResolvedValue();
      
      // Push two states to get to index 1
      undoManager.pushState('State 1');
      undoManager.pushState('State 2');
      
      expect(undoManager.currentIndex).toBe(1);
      
      await undoManager.undo();
      
      // Should decrement index
      expect(undoManager.currentIndex).toBe(0);
      
      // Should call restoreFullState with the state at index 0
      expect(restoreSpy).toHaveBeenCalledTimes(1);
      expect(restoreSpy).toHaveBeenCalledWith(undoManager.history[0]);
      
      // isUndoing should be false after completion
      expect(undoManager.isUndoing).toBe(false);
      
      // UI should update
      expect(mockNodeEditor.updateUndoUI).toHaveBeenCalled();
      
      restoreSpy.mockRestore();
    });
  });

  describe('redo', () => {
    it('does nothing when canRedo returns false', async () => {
      // Push one state, we're at the end
      undoManager.pushState('Only state');
      expect(undoManager.currentIndex).toBe(0);
      expect(undoManager.canRedo()).toBe(false);
      
      const initialIndex = undoManager.currentIndex;
      
      await undoManager.redo();
      
      // State should be unchanged
      expect(undoManager.currentIndex).toBe(initialIndex);
      expect(mockNodeEditor.api.batchUpdatePositions).not.toHaveBeenCalled();
    });

    it('increments currentIndex and calls restoreFullState', async () => {
      // Spy on restoreFullState
      const restoreSpy = vi.spyOn(undoManager, 'restoreFullState').mockResolvedValue();
      
      // Push two states
      undoManager.pushState('State 1');
      undoManager.pushState('State 2');
      expect(undoManager.currentIndex).toBe(1);
      
      // Undo to get to index 0
      await undoManager.undo();
      expect(undoManager.currentIndex).toBe(0);
      expect(undoManager.canRedo()).toBe(true);
      
      // Clear mock call history
      restoreSpy.mockClear();
      mockNodeEditor.updateUndoUI.mockClear();
      
      // Now redo
      await undoManager.redo();
      
      // Should increment index
      expect(undoManager.currentIndex).toBe(1);
      
      // Should call restoreFullState with the state at index 1
      expect(restoreSpy).toHaveBeenCalledTimes(1);
      expect(restoreSpy).toHaveBeenCalledWith(undoManager.history[1]);
      
      // isUndoing should be false after completion
      expect(undoManager.isUndoing).toBe(false);
      
      // UI should update
      expect(mockNodeEditor.updateUndoUI).toHaveBeenCalled();
      
      restoreSpy.mockRestore();
    });
  });
});
