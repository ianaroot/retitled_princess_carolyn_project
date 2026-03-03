import { describe, it, expect, beforeEach } from 'vitest';
import ZoomManager from '../zoom_manager.js';

describe('ZoomManager', () => {
  let zoomManager;
  let mockNodesCanvas;
  let mockConnectionsCanvas;
  let mockContainer;

  beforeEach(() => {
    // Setup DOM mocks
    mockNodesCanvas = {
      style: {},
      setAttribute: () => {}
    };
    mockConnectionsCanvas = {
      style: {},
      setAttribute: () => {}
    };
    mockContainer = {
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
      scrollLeft: 0,
      scrollTop: 0
    };
    
    zoomManager = new ZoomManager(mockNodesCanvas, mockConnectionsCanvas, mockContainer);
  });

  describe('zoom controls', () => {
    it('should initialize at 100% zoom', () => {
      expect(zoomManager.getZoomLevel()).toBe(1.0);
    });

    it('should zoom in', () => {
      zoomManager.zoomIn();
      expect(zoomManager.getZoomLevel()).toBeGreaterThan(1.0);
    });

    it('should zoom out', () => {
      zoomManager.zoomOut();
      expect(zoomManager.getZoomLevel()).toBeLessThan(1.0);
    });

    it('should reset to 100%', () => {
      zoomManager.zoomIn();
      zoomManager.zoomReset();
      expect(zoomManager.getZoomLevel()).toBe(1.0);
    });
  });

  describe('coordinate conversion', () => {
    it('should convert screen to canvas coordinates', () => {
      const screenX = 100;
      const screenY = 100;
      const canvas = zoomManager.screenToCanvas(screenX, screenY);
      
      expect(canvas.x).toBeTypeOf('number');
      expect(canvas.y).toBeTypeOf('number');
    });

    it('should convert canvas to screen coordinates', () => {
      const canvasX = 100;
      const canvasY = 100;
      const screen = zoomManager.canvasToScreen(canvasX, canvasY);
      
      expect(screen.x).toBeTypeOf('number');
      expect(screen.y).toBeTypeOf('number');
    });
  });

  describe('centerViewOnNodes', () => {
    it('should calculate zoom to fit nodes', () => {
      const nodes = new Map([
        [1, { position: { x: 0, y: 0 } }],
        [2, { position: { x: 500, y: 500 } }]
      ]);
      
      // Should not throw
      expect(() => zoomManager.centerViewOnNodes(nodes)).not.toThrow();
    });

    it('should handle empty nodes map', () => {
      const nodes = new Map();
      
      // Should not throw, just return early
      expect(() => zoomManager.centerViewOnNodes(nodes)).not.toThrow();
    });
  });
});
