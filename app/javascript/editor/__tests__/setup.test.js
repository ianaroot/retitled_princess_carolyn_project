import { describe, it, expect } from 'vitest';

describe('Vitest Setup', () => {
  it('should run tests', () => {
    expect(true).toBe(true);
  });
  
  it('should have access to document', () => {
    expect(typeof document).toBe('object');
  });
  
  it('should have access to window', () => {
    expect(typeof window).toBe('object');
  });
});
