class UndoManager {
  constructor(nodeEditor, maxHistory = 25) {
    this.nodeEditor = nodeEditor;
    this.maxHistory = maxHistory;
    this.history = [];
    this.currentIndex = -1;
    this.isUndoing = false;
  }

  pushState(description) {
    if (this.isUndoing) return;

    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const state = {
      timestamp: Date.now(),
      description,
      nodes: this.captureNodes(),
      connections: this.captureConnections()
    };

    this.history.push(state);
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }

    this.updateUI();
  }

  undo() {
    if (!this.canUndo()) return;

    this.isUndoing = true;
    this.currentIndex--;
    const state = this.history[this.currentIndex];
    
    this.restoreState(state);
    this.isUndoing = false;
    this.updateUI();
  }

  redo() {
    if (!this.canRedo()) return;

    this.isUndoing = true;
    this.currentIndex++;
    const state = this.history[this.currentIndex];
    
    this.restoreState(state);
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
    if (this.currentIndex === -1) return 'Undo (0/25)';
    return `Undo (${this.currentIndex + 1}/${this.history.length})`;
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
    const lines = document.querySelectorAll('line[data-source-id]');
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

  restoreState(state) {
    this.nodeEditor.nodes.forEach((node) => {
      node.element.remove();
    });
    this.nodeEditor.nodes.clear();

    state.nodes.forEach(nodeData => {
      this.nodeEditor.renderNode(nodeData);
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
