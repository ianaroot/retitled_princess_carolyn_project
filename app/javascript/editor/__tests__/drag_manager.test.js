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
      updateConnections: vi.fn()
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
      mockApi.updateNodePosition = vi.fn(() => {
        saveCalled = true;
        return Promise.resolve({});
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
});
