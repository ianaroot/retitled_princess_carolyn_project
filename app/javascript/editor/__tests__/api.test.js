import { describe, it, expect, beforeEach, vi } from 'vitest';
import EditorApi from '../api.js';

describe('EditorApi', () => {
  let api;
  const mockBotId = 123;

  beforeEach(() => {
    api = new EditorApi(mockBotId);
    
    // Mock fetch globally
    global.fetch = vi.fn();
    
    // Mock CSRF token meta tag
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf-token">';
  });

  describe('error handling', () => {
    it('should throw error when CSRF token is missing', () => {
      document.head.innerHTML = ''; // Remove CSRF token
      
      expect(() => api.getCsrfToken()).toThrow('CSRF token not found');
    });

    it('should handle network errors on createNode', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));
      
      await expect(api.createNode({ node_type: 'condition' }))
        .rejects.toThrow('Network error');
    });

    it('should handle HTTP errors on createNode', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Server error')
      });
      
      await expect(api.createNode({ node_type: 'condition' }))
        .rejects.toThrow('Server error');
    });

    it('should handle failed updateNode', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Not found')
      });
      
      await expect(api.updateNode(1, { data: {} }))
        .rejects.toThrow('Failed to update node');
    });

    it('should handle failed deleteNode', async () => {
      global.fetch.mockResolvedValue({
        ok: false
      });
      
      await expect(api.deleteNode(1))
        .rejects.toThrow('Failed to delete node');
    });

    it('should handle connection creation failure', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Connection failed')
      });
      
      await expect(api.createConnection(1, 2))
        .rejects.toThrow('Connection failed');
    });

    it('should handle position update failure', async () => {
      global.fetch.mockResolvedValue({
        ok: false
      });
      
      await expect(api.updateNodePosition(1, 100, 100))
        .rejects.toThrow('Failed to update position');
    });
  });

  describe('successful requests', () => {
    it('should create node successfully', async () => {
      const mockResponse = { id: 1, node_type: 'condition' };
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await api.createNode({ node_type: 'condition' });
      expect(result).toEqual(mockResponse);
    });

    it('should include CSRF token in headers', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      });

      await api.createNode({ node_type: 'condition' });

      const call = global.fetch.mock.calls[0];
      const headers = call[1].headers;
      expect(headers['X-CSRF-Token']).toBe('test-csrf-token');
    });
  });
});
