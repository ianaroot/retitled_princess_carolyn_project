// utils/validators.js
// Input validation for models

import { NODE_COLORS } from '../constants.js'

const VALID_NODE_TYPES = ['root', 'condition', 'action', 'connector']

/**
 * Validate node data before creation or update
 * @param {Object} params - Node parameters
 * @param {string} params.type - Node type (root, condition, action, connector)
 * @param {Object} params.position - Position { x, y }
 * @param {Object} [params.data] - Optional node data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateNode({ type, position, data = {} }) {
  const errors = []
  
  // Validate type
  if (!type) {
    errors.push('Node type is required')
  } else if (!VALID_NODE_TYPES.includes(type)) {
    errors.push(`Invalid node type: ${type}. Must be one of: ${VALID_NODE_TYPES.join(', ')}`)
  }
  
  // Validate position
  if (!position) {
    errors.push('Position is required')
  } else {
    if (typeof position.x !== 'number' || isNaN(position.x)) {
      errors.push('Position.x must be a number')
    }
    if (typeof position.y !== 'number' || isNaN(position.y)) {
      errors.push('Position.y must be a number')
    }
  }
  
  // Validate data (optional)
  if (data !== undefined && data !== null) {
    if (typeof data !== 'object' || Array.isArray(data)) {
      errors.push('Data must be an object')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate connection data before creation
 * @param {Object} params - Connection parameters
 * @param {string} params.sourceId - Source node client ID
 * @param {string} params.targetId - Target node client ID
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConnection({ sourceId, targetId }) {
  const errors = []
  
  // Validate sourceId
  if (!sourceId) {
    errors.push('Source ID is required')
  } else if (typeof sourceId !== 'string') {
    errors.push('Source ID must be a string')
  }
  
  // Validate targetId
  if (!targetId) {
    errors.push('Target ID is required')
  } else if (typeof targetId !== 'string') {
    errors.push('Target ID must be a string')
  }
  
  // Check for self-connection
  if (sourceId && targetId && sourceId === targetId) {
    errors.push('Cannot connect a node to itself')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate graph state (nodes and connections together)
 * @param {Object} graph - Graph object with nodes and connections
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGraph(graph) {
  const errors = []
  
  if (!graph || typeof graph !== 'object') {
    errors.push('Graph must be an object')
    return { valid: false, errors }
  }
  
  if (!graph.nodes || !(graph.nodes instanceof Map)) {
    errors.push('Graph must have a nodes Map')
  }
  
  if (!graph.connections || !(graph.connections instanceof Map)) {
    errors.push('Graph must have a connections Map')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

export default { validateNode, validateConnection, validateGraph }