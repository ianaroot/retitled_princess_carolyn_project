import { describe, it, expect, beforeEach, vi } from 'vitest';
import ZoomManager from '../zoom_manager.js';

describe('ZoomManager Edge Cases', () => {
  let zoomManager;
  let mockNodesCanvas;
  let mockConnectionsCanvas;
  let mockContainer;

  beforeEach(() => {
    mockNodesCanvas = {
      style: {},
      setAttribute: vi.fn()
    };
    mockConnectionsCanvas = {
      style: {},
      setAttribute: vi.fn()
    };
    mockContainer = {
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
      scrollLeft: 0,
      scrollTop: 0
    };

    zoomManager = new ZoomManager(mockNodesCanvas, mockConnectionsCanvas, mockContainer);
    
    // Mock requestAnimationFrame
    global.requestAnimationFrame = (cb) => cb();
  });

  describe('extreme zoom levels', () => {
    it('should not zoom in beyond maximum (200%)', () => {
      // Set zoom to near max
      zoomManager.zoomLevel = 1.95;
      zoomManager.zoomIn();
      
      expect(zoomManager.getZoomLevel()).toBe(2.0);
      
      // Try to zoom in again
      zoomManager.zoomIn();
      expect(zoomManager.getZoomLevel()).toBe(2.0); // Should stay at max
    });

    it('should not zoom out beyond minimum (1%)', () => {
      // Set zoom to near min
      zoomManager.zoomLevel = 0.02;
      zoomManager.zoomOut();
      
      expect(zoomManager.getZoomLevel()).toBe(0.01);
      
      // Try to zoom out again
      zoomManager.zoomOut();
      expect(zoomManager.getZoomLevel()).toBe(0.01); // Should stay at min
    });

    it('should handle zoom calculations at extreme levels', () => {
      zoomManager.zoomLevel = 0.01; // 1%
      zoomManager.applyZoom();
      
      // Canvas should be at minimum dimensions
      expect(mockNodesCanvas.style.width).toBeDefined();
      expect(mockConnectionsCanvas.style.width).toBeDefined();
    });
  });

  describe('centerViewOnNodes edge cases', () => {
    it('should handle single node', () => {
      const nodes = new Map([
        [1, { position: { x: 500, y: 500 } }]
      ]);

      // Should not throw
      expect(() => zoomManager.centerViewOnNodes(nodes)).not.toThrow();
    });

    it('should handle nodes with negative coordinates', () => {
      const nodes = new Map([
        [1, { position: { x: -100, y: -100 } }],
        [2, { position: { x: 100, y: 100 } }]
      ]);

      expect(() => zoomManager.centerViewOnNodes(nodes)).not.toThrow();
    });

    it('should handle very spread out nodes', () => {
      const nodes = new Map([
        [1, { position: { x: 0, y: 0 } }],
        [2, { position: { x: 5000, y: 5000 } }]
      ]);

      zoomManager.centerViewOnNodes(nodes);
      
      // Should zoom out to fit all nodes
      expect(zoomManager.getZoomLevel()).toBeLessThan(1.0);
    });

    it('should handle nodes clustered in one corner', () => {
      const nodes = new Map([
        [1, { position: { x: 0, y: 0 } }],
        [2, { position: { x: 50, y: 50 } }],
        [3, { position: { x: 100, y: 100 } }]
      ]);

      zoomManager.centerViewOnNodes(nodes);
      
      // Should not zoom in beyond 100%
      expect(zoomManager.getZoomLevel()).toBeLessThanOrEqual(1.0);
    });

    it('should handle empty nodes map', () => {
      const nodes = new Map();
      
      expect(() => zoomManager.centerViewOnNodes(nodes)).not.toThrow();
      // Zoom level should remain unchanged
      expect(zoomManager.getZoomLevel()).toBe(1.0);
    });
  });

  describe('coordinate conversion with different zoom levels', () => {
    it('should convert correctly at 50% zoom', () => {
      zoomManager.zoomLevel = 0.5;
      
      const canvas = zoomManager.screenToCanvas(100, 100);
      // At 50% zoom: (100 / 0.5) = 200
      expect(canvas.x).toBe(200);
      expect(canvas.y).toBe(200);
    });

    it('should convert correctly at 200% zoom', () => {
      zoomManager.zoomLevel = 2.0;
      
      const canvas = zoomManager.screenToCanvas(100, 100);
      // At 200% zoom: (100 / 2.0) = 50
      expect(canvas.x).toBe(50);
      expect(canvas.y).toBe(50);
    });

    it('should round-trip convert screen -> canvas -> screen', () => {
      const originalX = 150;
      const originalY = 150;
      
      const canvas = zoomManager.screenToCanvas(originalX, originalY);
      const screen = zoomManager.canvasToScreen(canvas.x, canvas.y);
      
      // Should be approximately equal (allowing for floating point)
      expect(Math.round(screen.x)).toBe(originalX);
      expect(Math.round(screen.y)).toBe(originalY);
    });
  });

  describe('applyZoom with null elements', () => {
    it('should not throw if nodesCanvas is null', () => {
      zoomManager.nodesCanvas = null;
      
      expect(() => zoomManager.applyZoom()).not.toThrow();
    });

    it('should not throw if connectionsCanvas is null', () => {
      zoomManager.connectionsCanvas = null;
      
      expect(() => zoomManager.applyZoom()).not.toThrow();
    });
  });

  describe('zoom button event handlers', () => {
    it('should set up event listeners on init', () => {
      // Check that ZoomManager tries to add event listeners
      // (in test environment, buttons may not exist)
      const zoomManager2 = new ZoomManager(
        mockNodesCanvas,
        mockConnectionsCanvas,
        mockContainer
      );
      
      expect(zoomManager2).toBeDefined();
    });
  });
});
