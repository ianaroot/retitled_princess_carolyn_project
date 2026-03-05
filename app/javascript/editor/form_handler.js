class NodeFormHandler {
  constructor(api, nodesMap, nodeEditor) {
    this.api = api;
    this.nodes = nodesMap;
    this.nodeEditor = nodeEditor;
    this.editingNodeId = null;

    this.conditionFields = {
      piece_type: [
        { name: 'piece', type: 'select', options: ['any', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] }
      ],
      position: [
        { name: 'rank', type: 'select', options: ['any', '1', '2', '3', '4', '5', '6', '7', '8'] },
        { name: 'file', type: 'select', options: ['any', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }
      ],
      attacked: [
        { name: 'by_any', type: 'checkbox', label: 'By any piece' },
        { name: 'by_pawn', type: 'checkbox', label: 'By pawn' },
        { name: 'by_knight', type: 'checkbox', label: 'By knight' },
        { name: 'by_bishop', type: 'checkbox', label: 'By bishop' },
        { name: 'by_rook', type: 'checkbox', label: 'By rook' },
        { name: 'by_queen', type: 'checkbox', label: 'By queen' },
        { name: 'by_king', type: 'checkbox', label: 'By king' }
      ],
      defended: [
        { name: 'by_any', type: 'checkbox', label: 'By any piece' },
        { name: 'min_count', type: 'number', label: 'Min defenders', default: 1 }
      ],
      attack_target: [
        { name: 'piece', type: 'select', options: ['any', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] },
        { name: 'has_escape', type: 'checkbox', label: 'Must have escape' }
      ],
      defend_target: [
        { name: 'piece', type: 'select', options: ['any', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] }
      ],
      general: [
        { name: 'query', type: 'select', options: [
          'enemy_queen_moved',
          'enemy_king_moved', 
          'more_than_n_rooks',
          'is_in_check',
          'can_castle',
          'piece_count_advantage'
        ]},
        { name: 'value', type: 'number', label: 'Value (if applicable)' }
      ]
    };

    this.actionFields = {
      move: [
        { name: 'direction', type: 'select', options: ['any', 'forward', 'backward', 'left', 'right', 'diagonal'] },
        { name: 'distance', type: 'select', options: ['any', '1', '2', '3', 'any_capture'] }
      ]
    };

    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('save-node')?.addEventListener('click', () => this.saveNode());
    document.getElementById('cancel-edit')?.addEventListener('click', () => this.closeEditor());

    document.getElementById('cond-piece-filter-type')?.addEventListener('change', (e) => {
      this.updatePieceFilterDisplay(e.target.value);
    });
    
    document.getElementById('cond-query')?.addEventListener('change', (e) => {
      this.updateQueryDetails(e.target.value);
    });
    
    document.getElementById('cond-position-type')?.addEventListener('change', (e) => {
      const isFile = e.target.value === 'file';
      document.getElementById('cond-position-file').classList.toggle('hidden', !isFile);
      document.getElementById('cond-position-num').classList.toggle('hidden', isFile);
      document.getElementById('cond-position-op').classList.toggle('hidden', isFile);
    });
    
    document.getElementById('cond-attacker-filter-type')?.addEventListener('change', (e) => {
      const type = e.target.value;
      document.getElementById('cond-attacker-specific').classList.toggle('hidden', type !== 'specific');
      document.getElementById('cond-attacker-value').classList.toggle('hidden', type !== 'value');
    });
    
    document.getElementById('cond-attacked-filter-type')?.addEventListener('change', (e) => {
      const type = e.target.value;
      document.getElementById('cond-attacked-specific').classList.toggle('hidden', type !== 'specific');
      document.getElementById('cond-attacked-value').classList.toggle('hidden', type !== 'value');
    });
  }

  openEditor(nodeOrId) {
    const panel = document.getElementById('node-editor-panel');
    const typeSpan = document.getElementById('edit-node-type');
    const conditionEditor = document.getElementById('condition-editor');
    const actionEditor = document.getElementById('action-editor');
    
    const nodeId = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;
    const nodeDataObj = typeof nodeOrId === 'object' ? nodeOrId : null;
    
    this.editingNodeId = nodeId;
    
    const finishOpen = (node) => {
      typeSpan.textContent = node.node_type;
      
      conditionEditor.classList.add('hidden');
      actionEditor.classList.add('hidden');
      
      let nodeData = node.data;
      if (typeof nodeData === 'string') {
        try {
          nodeData = JSON.parse(nodeData);
        } catch (e) {
          nodeData = {};
        }
      }
      
      if (node.node_type === 'condition') {
        conditionEditor.classList.remove('hidden');
        this.loadConditionEditor(nodeData);
      } else if (node.node_type === 'action') {
        actionEditor.classList.remove('hidden');
        this.loadActionEditor(nodeData.action_type || 'move', nodeData);
      }
      
      panel.classList.remove('hidden');
    };
    
    if (nodeDataObj && nodeDataObj.node_type) {
      finishOpen(nodeDataObj);
    } else {
      this.api.getNodeEditorData(nodeId)
      .then(node => finishOpen(node))
      .catch(err => console.error('Failed to load node:', err));
    }
  }

  closeEditor() {
    document.getElementById('node-editor-panel')?.classList.add('hidden');
    this.editingNodeId = null;
  }

  updatePieceFilterDisplay(type) {
    document.getElementById('cond-piece-specific').classList.toggle('hidden', type !== 'specific');
    document.getElementById('cond-piece-negative').classList.toggle('hidden', type !== 'negative');
    document.getElementById('cond-piece-value').classList.toggle('hidden', type !== 'value');
  }

  updateQueryDetails(query) {
    document.getElementById('cond-details').classList.remove('hidden');
    document.getElementById('cond-details-attacked').classList.add('hidden');
    document.getElementById('cond-details-attacking').classList.add('hidden');
    document.getElementById('cond-details-position').classList.add('hidden');
    
    if (query === 'is_attacked') {
      document.getElementById('cond-details-attacked').classList.remove('hidden');
    } else if (query === 'is_attacking') {
      document.getElementById('cond-details-attacking').classList.remove('hidden');
    } else if (query === 'position') {
      document.getElementById('cond-details-position').classList.remove('hidden');
    }
  }

  loadConditionEditor(data = {}) {
    data = data || {};
    
    document.getElementById('cond-context').value = data.context || 'self';
    document.getElementById('cond-piece-filter-type').value = data.piece_filter_type || 'specific';
    
    this.updatePieceFilterDisplay(data.piece_filter_type || 'specific');
    
    document.getElementById('cond-piece-type').value = data.piece_type || 'any';
    document.getElementById('cond-piece-negative-type').value = data.piece_negative_type || 'pawn';
    document.getElementById('cond-piece-value-op').value = data.piece_value_op || '>';
    document.getElementById('cond-piece-value-num').value = data.piece_value_num || 3;
    
    document.getElementById('cond-query').value = data.query || 'is_attacked';
    
    this.updateQueryDetails(data.query || 'is_attacked');
    
    document.getElementById('cond-attacker-filter-type').value = data.attacker_filter_type || 'any';
    document.getElementById('cond-attacker-type').value = data.attacker_type || 'pawn';
    document.getElementById('cond-attacker-value-op').value = data.attacker_value_op || '>';
    document.getElementById('cond-attacker-value-num').value = data.attacker_value_num || 3;
    
    document.getElementById('cond-attacked-filter-type').value = data.attacked_filter_type || 'any';
    document.getElementById('cond-attacked-type').value = data.attacked_type || 'pawn';
    document.getElementById('cond-attacked-value-op').value = data.attacked_value_op || '>';
    document.getElementById('cond-attacked-value-num').value = data.attacked_value_num || 3;
    
    document.getElementById('cond-position-type').value = data.position_type || 'rank';
    document.getElementById('cond-position-op').value = data.position_op || '>';
    document.getElementById('cond-position-num').value = data.position_num || 4;
    document.getElementById('cond-position-file').value = data.position_file || 'e';
    
    const detailsDiv = document.getElementById('cond-details');
    detailsDiv.classList.remove('hidden');
    
    document.getElementById('cond-details-attacked').classList.add('hidden');
    document.getElementById('cond-details-attacking').classList.add('hidden');
    document.getElementById('cond-details-position').classList.add('hidden');
    
    if (data.query === 'is_attacked') {
      document.getElementById('cond-details-attacked').classList.remove('hidden');
    } else if (data.query === 'is_attacking') {
      document.getElementById('cond-details-attacking').classList.remove('hidden');
    } else if (data.query === 'position') {
      document.getElementById('cond-details-position').classList.remove('hidden');
    }
    
    document.getElementById('cond-piece-specific').classList.toggle('hidden', data.piece_filter_type !== 'specific');
    document.getElementById('cond-piece-negative').classList.toggle('hidden', data.piece_filter_type !== 'negative');
    document.getElementById('cond-piece-value').classList.toggle('hidden', data.piece_filter_type !== 'value');
    
    document.getElementById('cond-attacker-specific').classList.toggle('hidden', data.attacker_filter_type !== 'specific');
    document.getElementById('cond-attacker-value').classList.toggle('hidden', data.attacker_filter_type !== 'value');
    document.getElementById('cond-attacked-specific').classList.toggle('hidden', data.attacked_filter_type !== 'specific');
    document.getElementById('cond-attacked-value').classList.toggle('hidden', data.attacked_filter_type !== 'value');
    document.getElementById('cond-position-file').classList.toggle('hidden', data.position_type !== 'file');
    document.getElementById('cond-position-num').classList.toggle('hidden', data.position_type === 'file');
  }

  loadActionEditor(actionType, data = {}) {
    const fieldsDiv = document.getElementById('action-fields');
    const actionFields = this.actionFields[actionType] || [];
    
    fieldsDiv.innerHTML = actionFields.map(field => {
      const value = data[field.name] ?? field.default ?? '';
      return `
        <div class="form-group">
          <label>${field.label || field.name.replace(/_/g, ' ')}</label>
          <select name="${field.name}">
            ${field.options.map(opt => 
              `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt}</option>`
            ).join('')}
          </select>
        </div>
      `;
    }).join('');
  }

  saveNode() {
    if (!this.api.botId || !this.editingNodeId) return;
    
    const typeSpan = document.getElementById('edit-node-type');
    const nodeType = typeSpan.textContent;
    
    const data = {};
    
    if (nodeType === 'condition') {
      data.context = document.getElementById('cond-context').value;
      data.piece_filter_type = document.getElementById('cond-piece-filter-type').value;
      
      if (data.piece_filter_type === 'specific') {
        data.piece_type = document.getElementById('cond-piece-type').value;
      } else if (data.piece_filter_type === 'negative') {
        data.piece_negative_type = document.getElementById('cond-piece-negative-type').value;
      } else if (data.piece_filter_type === 'value') {
        data.piece_value_op = document.getElementById('cond-piece-value-op').value;
        data.piece_value_num = parseInt(document.getElementById('cond-piece-value-num').value);
      }
      
      data.query = document.getElementById('cond-query').value;
      
      if (data.query === 'is_attacked') {
        data.attacker_filter_type = document.getElementById('cond-attacker-filter-type').value;
        if (data.attacker_filter_type === 'specific') {
          data.attacker_type = document.getElementById('cond-attacker-type').value;
        } else if (data.attacker_filter_type === 'value') {
          data.attacker_value_op = document.getElementById('cond-attacker-value-op').value;
          data.attacker_value_num = parseInt(document.getElementById('cond-attacker-value-num').value);
        }
      } else if (data.query === 'is_attacking') {
        data.attacked_filter_type = document.getElementById('cond-attacked-filter-type').value;
        if (data.attacked_filter_type === 'specific') {
          data.attacked_type = document.getElementById('cond-attacked-type').value;
        } else if (data.attacked_filter_type === 'value') {
          data.attacked_value_op = document.getElementById('cond-attacked-value-op').value;
          data.attacked_value_num = parseInt(document.getElementById('cond-attacked-value-num').value);
        }
      } else if (data.query === 'position') {
        data.position_type = document.getElementById('cond-position-type').value;
        if (data.position_type === 'file') {
          data.position_file = document.getElementById('cond-position-file').value;
        } else {
          data.position_op = document.getElementById('cond-position-op').value;
          data.position_num = parseInt(document.getElementById('cond-position-num').value);
        }
      }
    } else if (nodeType === 'action') {
      data.action_type = 'move';
      document.querySelectorAll('#action-fields [name]').forEach(el => {
        data[el.name] = el.value;
      });
    }
    
    this.api.updateNode(this.editingNodeId, data)
    .then(node => {
      const nodeEl = this.nodes.get(node.id)?.element;
      if (nodeEl) {
        this.api.getNodePreviewHtml(node.id)
        .then(html => {
          nodeEl.querySelector('.node-content').innerHTML = html;
        });
      }
      this.closeEditor();
      // Push state AFTER successful update
      if (this.nodeEditor && this.nodeEditor.undoManager) {
        this.nodeEditor.undoManager.pushState('Update node configuration');
      }
    })
    .catch(err => console.error('Failed to save node:', err));
  }
}

export default NodeFormHandler;