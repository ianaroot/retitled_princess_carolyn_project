class EditorApi {
  constructor(botId) {
    this.botId = botId;
    this.baseUrl = `/bots/${this.botId}/nodes`;
  }

  getCsrfToken() {
    const token = document.querySelector('meta[name="csrf-token"]')?.content 
        || document.querySelector('[name="csrf-token"]')?.content;
    if (!token) {
      throw new Error('CSRF token not found');
    }
    return token;
  }

  headers(accept = 'application/json') {
    return {
      'Content-Type': 'application/json',
      'Accept': accept,
      'X-CSRF-Token': this.getCsrfToken()
    };
  }

  async createNode(nodeData) {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ node: nodeData })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async updateNode(nodeId, data) {
    const res = await fetch(`${this.baseUrl}/${nodeId}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ node: { data: data } })
    });
    if (!res.ok) throw new Error('Failed to update node');
    return res.json();
  }

  async getNodeEditorData(nodeId) {
    const res = await fetch(`${this.baseUrl}/${nodeId}/edit`, {
      headers: this.headers()
    });
    if (!res.ok) throw new Error('Failed to load node editor data');
    return res.json();
  }

  async getNodePreviewHtml(nodeId) {
    const res = await fetch(`${this.baseUrl}/${nodeId}`, {
      headers: this.headers('text/html')
    });
    if (!res.ok) throw new Error('Failed to load node preview');
    return res.text();
  }

  async deleteNode(nodeId) {
    const res = await fetch(`${this.baseUrl}/${nodeId}`, {
      method: 'DELETE',
      headers: this.headers()
    });
    if (!res.ok) throw new Error('Failed to delete node');
    return true;
  }

  async updateNodePosition(nodeId, x, y) {
    const res = await fetch(`${this.baseUrl}/${nodeId}/update_position`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ position_x: x, position_y: y })
    });
    if (!res.ok) throw new Error('Failed to update position');
    return res.json();
  }

  async createConnection(sourceId, targetId) {
    const res = await fetch(`${this.baseUrl}/${sourceId}/connect`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ target_id: targetId })
    });
    if (!res.ok) throw new Error('Connection failed');
    return res.json();
  }

  async deleteConnection(sourceId, connectionId) {
    const res = await fetch(`${this.baseUrl}/${sourceId}/connections/${connectionId}`, {
      method: 'DELETE',
      headers: this.headers()
    });
    if (!res.ok) throw new Error('Failed to disconnect');
    return true;
  }

  async batchUpdatePositions(nodesData) {
    const res = await fetch(`${this.baseUrl}/batch_update_positions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ nodes: nodesData })
    });
    if (!res.ok) throw new Error('Failed to update positions');
    return true;
  }
}

export default EditorApi;
