import { CONNECTION_STROKE_COLOR } from 'editor/constants';

class UndoManager {
  constructor(nodeEditor, maxHistory = 25) {
    this.nodeEditor = nodeEditor;
    this.maxHistory = maxHistory;
    this.history = [];
    this.currentIndex = -1;
    this.isUndoing = false;
    
    // Track ID mappings when nodes are recreated (for connection restoration)
    this.idMapping = new Map();
  }

  pushState(description, batchUpdates = null) {
    if (this.isUndoing) return;

    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const state = {
      timestamp: Date.now(),
      description,
      nodes: this.captureNodes(),
      connections: this.captureConnections(),
      batchUpdates
    };

    this.history.push(state);
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }

    this.updateUI();
  }

  pushDragState(description, preDragPositions, postDragPositions) {
    if (this.isUndoing) return;

    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const state = {
      timestamp: Date.now(),
      description,
      nodes: this.captureNodes(),
      connections: this.captureConnections(),
      preDragPositions,
      postDragPositions
    };

    this.history.push(state);
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }

    this.updateUI();
  }

  async undo() {
    if (!this.canUndo()) return;

    this.isUndoing = true;
    
    // Save the state we're undoing FROM (for detecting drag operations)
    const fromIndex = this.currentIndex;
    const fromState = this.history[fromIndex];
    
    // Move back one step
    this.currentIndex--;
    const toState = this.history[this.currentIndex];
    
    // Check if we're undoing a drag operation
    if (fromState.preDragPositions && fromState.preDragPositions.length > 0) {
      // Drag undo: only revert positions using pre-drag positions
      await this.nodeEditor.api.batchUpdatePositions(fromState.preDragPositions);
      this.updateNodePositions(fromState.preDragPositions);
    } else {
      // Non-drag undo: full graph restore
      await this.restoreFullState(toState);
      this.visualRestore(toState);
    }
    
    this.isUndoing = false;
    this.updateUI();
  }

  async redo() {
    if (!this.canRedo()) return;

    this.isUndoing = true;
    this.currentIndex++;
    const toState = this.history[this.currentIndex];
    
    // Check if we're redoing to a drag state
    if (toState.postDragPositions && toState.postDragPositions.length > 0) {
      // Drag redo: apply post-drag positions
      await this.nodeEditor.api.batchUpdatePositions(toState.postDragPositions);
      this.updateNodePositions(toState.postDragPositions);
    } else {
      // Non-drag redo: full graph restore
      await this.restoreFullState(toState);
      this.visualRestore(toState);
    }
    
    this.isUndoing = false;
    this.updateUI();
  }

  canUndo() {
    return this.currentIndex > 0;
  }

  canRedo() {
    return this.currentIndex < this.history.length - 1;
  }

  getHistoryDisplay() {
    if (this.currentIndex === -1) return '(0/25)';
    return `(${this.currentIndex + 1}/${this.maxHistory})`;
  }

  captureNodes() {
    const nodes = [];
    this.nodeEditor.nodes.forEach((node, id) => {
      nodes.push({
        id,
        node_type: node.type,
        position_x: node.position.x,
        position_y: node.position.y,
        data: { ...node.data }
      });
    });
    return nodes;
  }

  captureConnections() {
    const connections = [];
    // Only capture VISIBLE lines (green stroke), not transparent hitArea lines
    const lines = document.querySelectorAll(`line[data-source-id][stroke="${CONNECTION_STROKE_COLOR}"]`);
    lines.forEach(line => {
      if (line.dataset.connectionId && !line.dataset.connectionId.startsWith('restored-')) {
        connections.push({
          source_node_id: parseInt(line.dataset.sourceId),
          target_node_id: parseInt(line.dataset.targetId),
          connection_id: line.dataset.connectionId
        });
      }
    });
    return connections;
  }

  async restoreFullState(state) {
    try {
      // Reset ID mappings for this restore operation
      this.idMapping.clear();
      
      // 1. Sync nodes with server
      const currentNodeIds = new Set(this.nodeEditor.nodes.keys());
      const targetNodeIds = new Set(state.nodes.map(n => n.id));
      
      // Delete nodes that exist now but not in target state
      const deletePromises = [];
      for (const id of currentNodeIds) {
        if (!targetNodeIds.has(id)) {
          deletePromises.push(
            this.nodeEditor.api.deleteNode(id).catch(err => {
              console.error(`Failed to delete node ${id}:`, err);
            })
          );
        }
      }
      await Promise.all(deletePromises);
      
      // Create or update nodes
      const createUpdatePromises = [];
      for (const node of state.nodes) {
        if (!currentNodeIds.has(node.id)) {
          // Create node that exists in target but not now
          createUpdatePromises.push(
            this.nodeEditor.api.createNode({
              node_type: node.node_type,
              position_x: node.position_x,
              position_y: node.position_y,
              data: node.data
            }).then(created => {
              // Server may assign new ID when recreating node
              if (node.id !== created.id) {
                this.idMapping.set(node.id, created.id);
                console.log(`UndoManager: Remapped node ${node.id} -> ${created.id}`);
                node.id = created.id;
              }
            }).catch(err => {
              console.error(`Failed to create node:`, err);
            })
          );
        } else {
          // Update position if node exists
          const currentNode = this.nodeEditor.nodes.get(node.id);
          if (currentNode.position.x !== node.position_x || 
              currentNode.position.y !== node.position_y) {
            createUpdatePromises.push(
              this.nodeEditor.api.updateNodePosition(node.id, node.position_x, node.position_y)
                .catch(err => {
                  console.error(`Failed to update position for node ${node.id}:`, err);
                })
            );
          }
        }
      }
      await Promise.all(createUpdatePromises);
      
      // 2. Sync connections with server
      // Get current connections from DOM
      const currentConnections = new Set();
      document.querySelectorAll('line[data-connection-id]').forEach(line => {
        if (line.dataset.connectionId && !line.dataset.connectionId.startsWith('restored-')) {
          currentConnections.add(`${line.dataset.sourceId}-${line.dataset.targetId}`);
        }
      });
      
      const targetConnections = new Set();
      state.connections.forEach(conn => {
        targetConnections.add(`${conn.source_node_id}-${conn.target_node_id}`);
      });
      
      // Delete connections that exist now but not in target
      const deleteConnPromises = [];
      document.querySelectorAll('line[data-connection-id]').forEach(line => {
        const key = `${line.dataset.sourceId}-${line.dataset.targetId}`;
        if (!targetConnections.has(key) && line.dataset.connectionId) {
          deleteConnPromises.push(
            this.nodeEditor.api.deleteConnection(
              parseInt(line.dataset.sourceId), 
              line.dataset.connectionId
            ).catch(err => {
              console.error(`Failed to delete connection:`, err);
            })
          );
        }
      });
      await Promise.all(deleteConnPromises);
      
      // Create connections that exist in target but not now
      const createConnPromises = [];
      for (const conn of state.connections) {
        // Translate IDs in case nodes were recreated with new IDs
        const sourceId = this.idMapping.get(conn.source_node_id) || conn.source_node_id;
        const targetId = this.idMapping.get(conn.target_node_id) || conn.target_node_id;
        const key = `${sourceId}-${targetId}`;

        // debugging node reconnection error in undo of deletion of connected nodes
        console.log(`Processing connection: ${conn.source_node_id} -> ${conn.target_node_id}, translated: ${sourceId} -> ${targetId}`);
        console.log(`Key: ${key}, exists in currentConnections: ${currentConnections.has(key)}`);
        
        if (!currentConnections.has(key)) {
          createConnPromises.push(
            this.nodeEditor.api.createConnection(sourceId, targetId)
              .catch(err => {
                console.error(`Failed to create connection ${sourceId}->${targetId}:`, err);
              })
          );
        }
      }
      await Promise.all(createConnPromises);
      
    } catch (error) {
      console.error('Undo operation failed:', error);
      this.showErrorBanner(error);
    }
  }

  updateNodePositions(positions) {
    // Only update visual positions of nodes, don't recreate elements or connections
    positions.forEach(update => {
      const node = this.nodeEditor.nodes.get(update.id);
      if (node) {
        node.position.x = update.x;
        node.position.y = update.y;
        node.element.style.left = `${update.x}px`;
        node.element.style.top = `${update.y}px`;
      }
    });
    // Update connection lines
    this.nodeEditor.connectionManager.updateConnections();
  }

  showErrorBanner(error) {
    const banner = document.createElement('div');
    banner.id = 'undo-error-banner';
    banner.style.cssText = 'position:fixed;bottom:20px;left:20px;right:20px;max-width:600px;margin:0 auto;background:#fee;border:2px solid #c00;color:#c00;padding:15px;z-index:9999;border-radius:5px;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;';
    banner.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <strong style="font-size:16px;">Undo Failed</strong><br>
          <span style="font-size:13px;">Take a screenshot now, then dismiss</span><br><br>
          <code style="background:#fff;padding:4px 8px;border-radius:3px;font-size:12px;">${error.message}</code>
        </div>
        <button onclick="document.getElementById('undo-error-banner').remove()" style="background:#c00;color:white;border:none;padding:8px 16px;cursor:pointer;border-radius:3px;margin-left:15px;font-weight:bold;">Dismiss</button>
      </div>
    `;
    document.body.appendChild(banner);
  }

  visualRestore(state) {
    this.nodeEditor.nodes.forEach((node) => {
      node.element.remove();
    });
    this.nodeEditor.nodes.clear();

    // Clear connection visuals to prevent traces
    this.nodeEditor.connectionsCanvas.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());

    // Render nodes
    state.nodes.forEach(nodeData => {
      this.nodeEditor.renderNode(nodeData);
    });

    // Re-fetch preview HTML for all nodes with retry logic
    state.nodes.forEach(nodeData => {
      const nodeEl = this.nodeEditor.nodes.get(nodeData.id)?.element;
      if (nodeEl) {
        this.fetchPreviewWithRetry(nodeEl, nodeData.id, 0);
      }
    });

    state.connections.forEach(conn => {
      if (this.nodeEditor.nodes.has(conn.source_node_id) && 
          this.nodeEditor.nodes.has(conn.target_node_id)) {
        this.nodeEditor.connectionManager.drawConnection(
          conn.source_node_id, 
          conn.target_node_id,
          conn.connection_id
        );
      }
    });
  }

  fetchPreviewWithRetry(nodeEl, nodeId, attempt = 0) {
    const maxAttempts = 3;
    
    this.nodeEditor.api.getNodePreviewHtml(nodeId)
      .then(html => {
        nodeEl.querySelector('.node-content').innerHTML = html;
      })
      .catch(err => {
        if (attempt < maxAttempts - 1) {
          // Retry automatically with exponential backoff
          setTimeout(() => {
            this.fetchPreviewWithRetry(nodeEl, nodeId, attempt + 1);
          }, 1000 * (attempt + 1)); // 1s, then 2s
        } else {
          // Final failure: show manual retry button
          nodeEl.querySelector('.node-content').innerHTML = `
            <div style="color:#c00;font-size:11px;">
              ⚠️ Preview unavailable<br>
              <button onclick="window.nodeEditor.retryPreview(${nodeId})" 
                      style="margin-top:4px;padding:2px 8px;font-size:10px;cursor:pointer;background:#fee;border:1px solid #c00;border-radius:3px;">
                Retry
              </button>
            </div>
          `;
        }
      });
  }

  updateUI() {
    if (this.nodeEditor.updateUndoUI) {
      this.nodeEditor.updateUndoUI();
    }
  }

  clear() {
    this.history = [];
    this.currentIndex = -1;
    this.updateUI();
  }
}

export default UndoManager;
