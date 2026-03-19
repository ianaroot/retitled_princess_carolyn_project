// constants.js
// Shared configuration and event names for editorV2

// Node dimensions
export const NODE_WIDTH = 100
export const NODE_HEIGHT = 60
export const CONNECTOR_SIZE = 14

// Connection styling
export const CONNECTION_COLOR = '#4CAF50'
export const CONNECTION_STROKE_WIDTH = 2
export const CONNECTION_HITAREA_WIDTH = 20

// Temp line styling (during connection drag)
export const TEMP_LINE_COLOR = '#4CAF50'
export const TEMP_LINE_STROKE_WIDTH = 3
export const TEMP_LINE_STROKE_DASHARRAY = '5,5'

// History
export const MAX_HISTORY = 50

// Node type colors (matching existing CSS)
export const NODE_COLORS = {
  root: '#FFD700',
  condition: '#e94560',
  action: '#4CAF50',
  connector: '#9C27B0'
}

// Event names for Store subscriber pattern
// Use these constants to prevent typos and enable IDE autocomplete
export const EVENTS = {
  NODE_ADD: 'node:add',
  NODE_UPDATE: 'node:update',
  NODE_REMOVE: 'node:remove',
  CONNECTION_ADD: 'connection:add',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_REMOVE: 'connection:remove',
  GRAPH_REPLACE: 'graph:replace',
  GRAPH_RESTORE: 'graph:restore'
}

// Default position for new nodes
export const DEFAULT_NODE_POSITION = { x: 100, y: 100 }