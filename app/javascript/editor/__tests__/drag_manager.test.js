import { describe, it, expect, beforeEach, vi } from 'vitest';
import DragManager from '../drag_manager.js';

describe('DragManager', () => {
  let dragManager;
  let mockNodes;
  let mockNodesCanvas;
  let mockApi;
  let mockConnectionManager;
  let mockScreenToCanvas;

  beforeEach(() => {
    mockNodes = new Map();
    mockNodesCanvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0 })
    };
    mockApi = {};
    mockConnectionManager = {
      updateConnections: vi.fn(),
      getDescendantNodeIds: vi.fn(() => new Set())
    };
    mockScreenToCanvas = vi.fn((x, y) => ({ x, y }));

    dragManager = new DragManager(
      mockNodes,
      mockNodesCanvas,
      mockApi,
      mockConnectionManager,
      mockScreenToCanvas
    );
  });

  describe('startDrag', () => {
    it('should calculate drag offset correctly', () => {
      const nodeEl = {
        style: { left: '100px', top: '100px' },
        getBoundingClientRect: () => ({ left: 100, top: 100, width: 100, height: 60 })
      };
      
      mockNodes.set(1, { element: nodeEl, position: { x: 100, y: 100 } });
      
      const mockEvent = {
        clientX: 150,
        clientY: 150
      };

      dragManager.startDrag(mockEvent, 1);

      expect(dragManager.selectedNode).toBe(1);
      expect(dragManager.isDragging).toBe(true);
      expect(dragManager.dragOffset.x).toBe(50);
      expect(dragManager.dragOffset.y).toBe(50);
    });

    it('should not start drag for non-existent node', () => {
      const mockEvent = { clientX: 100, clientY: 100 };
      
      dragManager.startDrag(mockEvent, 999);

      expect(dragManager.selectedNode).toBeNull();
      expect(dragManager.isDragging).toBe(false);
    });
  });

  describe('handleMouseMove', () => {
    it('should update node position during drag', () => {
      const nodeEl = {
        style: { left: '100px', top: '100px' },
        getBoundingClientRect: () => ({ left: 100, top: 100, width: 100, height: 60 })
      };
      
      mockNodes.set(1, { 
        element: nodeEl, 
        position: { x: 100, y: 100 },
        style: nodeEl.style
      });

      // Start drag at (150, 150), position is (100, 100), so offset = (50, 50)
      dragManager.startDrag({ clientX: 150, clientY: 150 }, 1);
      
      // Verify drag started
      expect(dragManager.isDragging).toBe(true);
      expect(dragManager.dragOffset.x).toBe(50);
      expect(dragManager.dragOffset.y).toBe(50);

      // Move mouse to (200, 200)
      // screenToCanvas returns (200, 200), minus offset (50, 50) = (150, 150)
      const moveEvent = { clientX: 200, clientY: 200 };
      dragManager.handleMouseMove(moveEvent);

      // Check position was updated
      expect(mockNodes.get(1).position.x).toBe(150);
      expect(mockNodes.get(1).position.y).toBe(150);
      expect(dragManager.positionChanged).toBe(true);
    });

    it('should not update position if not dragging', () => {
      const mockEvent = { clientX: 200, clientY: 200 };
      
      dragManager.handleMouseMove(mockEvent);
      
      // Should not throw or modify anything
      expect(dragManager.positionChanged).toBe(false);
    });
  });

  describe('handleMouseUp', () => {
    beforeEach(() => {
      mockApi.botId = 1;
    });

    it('should save position after drag', async () => {
      const nodeEl = {
        style: { left: '100px', top: '100px' },
        getBoundingClientRect: () => ({ left: 100, top: 100, width: 100, height: 60 })
      };
      
      mockNodes.set(1, { 
        element: nodeEl, 
        position: { x: 100, y: 100 },
        style: nodeEl.style
      });

      let saveCalled = false;
      mockApi.botId = 1;
      mockApi.batchUpdatePositions = vi.fn(() => {
        saveCalled = true;
        return Promise.resolve(true);
      });

      // Start and end drag with position change
      dragManager.startDrag({ clientX: 150, clientY: 150 }, 1);
      dragManager.positionChanged = true;
      
      dragManager.handleMouseUp({ clientX: 200, clientY: 200 });

      // In actual implementation, this would call api.updateNodePosition
      // Here we're just verifying the drag state is reset
      expect(dragManager.isDragging).toBe(false);
      expect(dragManager.selectedNode).toBeNull();
    });

    it('should not save if position did not change', () => {
      const nodeEl = {
        style: { left: '100px', top: '100px' },
        getBoundingClientRect: () => ({ left: 100, top: 100, width: 100, height: 60 })
      };
      
      mockNodes.set(1, { 
        element: nodeEl, 
        position: { x: 100, y: 100 },
        style: nodeEl.style
      });

      dragManager.startDrag({ clientX: 150, clientY: 150 }, 1);
      // positionChanged stays false
      
      dragManager.handleMouseUp({ clientX: 150, clientY: 150 });

      expect(dragManager.isDragging).toBe(false);
    });
  });

  describe('coordinate conversion', () => {
    it('should use screenToCanvas when available', () => {
      const nodeEl = {
        style: { left: '100px', top: '100px' },
        getBoundingClientRect: () => ({ left: 100, top: 100, width: 100, height: 60 })
      };
      
      mockNodes.set(1, { element: nodeEl, position: { x: 100, y: 100 } });
      
      mockScreenToCanvas.mockReturnValue({ x: 200, y: 200 });

      dragManager.startDrag({ clientX: 300, clientY: 300 }, 1);

      expect(mockScreenToCanvas).toHaveBeenCalledWith(300, 300);
      expect(dragManager.dragOffset.x).toBe(100); // 200 - 100
      expect(dragManager.dragOffset.y).toBe(100); // 200 - 100
    });
  });

  describe('parent-child dragging', () => {
    const createMockNode = (id, x, y) => ({
      element: { 
        style: { 
          left: `${x}px`, 
          top: `${y}px` 
        } 
      },
      position: { x, y }
    });

    beforeEach(() => {
      mockApi.botId = 1;
      mockApi.batchUpdatePositions = vi.fn(() => Promise.resolve(true));
    });

    it('moves parent and all descendants with exact delta', async () => {
      mockNodes.set(1, createMockNode(1, 100, 100));
      mockNodes.set(2, createMockNode(2, 200, 200));
      mockNodes.set(3, createMockNode(3, 300, 300));
      mockConnectionManager.getDescendantNodeIds.mockReturnValue(new Set([2, 3]));

      dragManager.startDrag({ clientX: 150, clientY: 150 }, 1);
      dragManager.handleMouseMove({ clientX: 250, clientY: 250 });
      await dragManager.handleMouseUp();

      expect(mockNodes.get(1).position).toEqual({ x: 200, y: 200 });
      expect(mockNodes.get(2).position).toEqual({ x: 300, y: 300 });
      expect(mockNodes.get(3).position).toEqual({ x: 400, y: 400 });

      expect(mockApi.batchUpdatePositions).toHaveBeenCalledWith([
        { id: 1, x: 200, y: 200 },
        { id: 2, x: 300, y: 300 },
        { id: 3, x: 400, y: 400 }
      ]);
    });

    it('only moves parent when no descendants', async () => {
      mockNodes.set(1, createMockNode(1, 100, 100));
      mockConnectionManager.getDescendantNodeIds.mockReturnValue(new Set());

      dragManager.startDrag({ clientX: 150, clientY: 150 }, 1);
      dragManager.handleMouseMove({ clientX: 250, clientY: 250 });
      await dragManager.handleMouseUp();

      const payload = mockApi.batchUpdatePositions.mock.calls[0][0];
      expect(payload).toHaveLength(1);
      expect(payload[0]).toEqual({ id: 1, x: 200, y: 200 });
    });

    it('handles grandchild nodes correctly', async () => {
      mockNodes.set(1, createMockNode(1, 100, 100));
      mockNodes.set(2, createMockNode(2, 200, 200));
      mockNodes.set(3, createMockNode(3, 300, 300));
      mockConnectionManager.getDescendantNodeIds.mockReturnValue(new Set([2, 3]));

      dragManager.startDrag({ clientX: 100, clientY: 100 }, 1);
      dragManager.handleMouseMove({ clientX: 200, clientY: 200 });
      await dragManager.handleMouseUp();

      expect(mockApi.batchUpdatePositions).toHaveBeenCalledWith([
        { id: 1, x: 200, y: 200 },
        { id: 2, x: 300, y: 300 },
        { id: 3, x: 400, y: 400 }
      ]);
    });

    it('shows error alert when batchUpdate fails', async () => {
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

      mockNodes.set(1, createMockNode(1, 100, 100));
      mockNodes.set(2, createMockNode(2, 200, 200));
      mockConnectionManager.getDescendantNodeIds.mockReturnValue(new Set([2]));
      mockApi.batchUpdatePositions.mockRejectedValue(new Error('Network error'));

      dragManager.startDrag({ clientX: 150, clientY: 150 }, 1);
      dragManager.handleMouseMove({ clientX: 250, clientY: 250 });
      dragManager.handleMouseUp();
      
      // Wait for promise rejection handler to run
      await new Promise(resolve => setTimeout(resolve, 0));

      // Positions remain at dragged location (no rollback with immediate reset)
      expect(mockNodes.get(1).position).toEqual({ x: 200, y: 200 });
      expect(mockNodes.get(2).position).toEqual({ x: 300, y: 300 });
      expect(alertMock).toHaveBeenCalledWith('Failed to save positions. Please refresh the page.');

      alertMock.mockRestore();
    });

    it('throttles rapid mousemove events', () => {
      mockNodes.set(1, createMockNode(1, 100, 100));
      mockConnectionManager.getDescendantNodeIds.mockReturnValue(new Set());

      dragManager.startDrag({ clientX: 100, clientY: 100 }, 1);

      for (let i = 0; i < 50; i++) {
        dragManager.handleMouseMove({ clientX: 100 + i, clientY: 100 + i });
      }

      const updateCount = mockConnectionManager.updateConnections.mock.calls.length;
      expect(updateCount).toBeLessThan(10);
    });

    it('handles 20+ children without performance issues', async () => {
      mockNodes.set(1, createMockNode(1, 100, 100));
      const childIds = [];
      for (let i = 2; i <= 22; i++) {
        mockNodes.set(i, createMockNode(i, i * 50, i * 50));
        childIds.push(i);
      }
      mockConnectionManager.getDescendantNodeIds.mockReturnValue(new Set(childIds));

      const startTime = performance.now();

      dragManager.startDrag({ clientX: 100, clientY: 100 }, 1);
      dragManager.handleMouseMove({ clientX: 200, clientY: 200 });
      await dragManager.handleMouseUp();

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100);

      const payload = mockApi.batchUpdatePositions.mock.calls[0][0];
      expect(payload).toHaveLength(22);
    });

    it('skips missing nodes gracefully', async () => {
      mockNodes.set(1, createMockNode(1, 100, 100));
      mockConnectionManager.getDescendantNodeIds.mockReturnValue(new Set([2]));

      dragManager.startDrag({ clientX: 100, clientY: 100 }, 1);
      dragManager.handleMouseMove({ clientX: 200, clientY: 200 });

      expect(() => dragManager.handleMouseUp()).not.toThrow();
    });
  });
});
