require 'rails_helper'

RSpec.describe BotNodesController, type: :request do
  let(:user) { create(:user) }
  let(:bot) { create(:bot, user: user) }
  let(:node) { create(:node, bot: bot) }

  describe 'authentication' do
    it 'redirects to login for all actions when not authenticated' do
      get bot_node_path(bot, node)
      expect(response).to redirect_to(new_user_session_path)
    end
  end

  describe 'GET #show' do
    before { sign_in user }

    context 'with HTML format' do
      it 'returns the node preview partial' do
        get bot_node_path(bot, node), headers: { 'Accept' => 'text/html' }
        expect(response).to have_http_status(:success)
        expect(response.body).to include('node-preview')
      end
    end

    context 'with JSON format' do
      it 'returns the node as JSON' do
        get bot_node_path(bot, node, format: :json)
        expect(response).to have_http_status(:success)
        json = JSON.parse(response.body)
        expect(json['id']).to eq(node.id)
        expect(json['node_type']).to eq(node.node_type)
      end
    end

    it 'returns 404 for nodes from another users bot' do
      other_bot = create(:bot)
      other_node = create(:node, bot: other_bot)
      expect {
        get bot_node_path(bot, other_node)
      }.to raise_error(ActiveRecord::RecordNotFound)
    end
  end

  describe 'GET #edit' do
    before { sign_in user }

    it 'returns the node as JSON' do
      get edit_bot_node_path(bot, node, format: :json)
      expect(response).to have_http_status(:success)
      json = JSON.parse(response.body)
      expect(json['id']).to eq(node.id)
    end
  end

  describe 'POST #create' do
    before { sign_in user }

    let(:valid_params) do
      {
        node: {
          node_type: 'condition',
          position_x: 100,
          position_y: 200
        }
      }
    end

    let(:invalid_params) do
      {
        node: {
          node_type: '',
          position_x: 100,
          position_y: 200
        }
      }
    end

    it 'creates a node with valid params' do
      bot #instantiating the bot in advance so the creation of root node doesn't make the count change by 2 instead of 1
      expect {
        post bot_nodes_path(bot), params: valid_params
      }.to change(Node, :count).by(1)
      expect(response).to have_http_status(:created)
      json = JSON.parse(response.body)
      expect(json['node_type']).to eq('condition')
    end

    it 'assigns the node to the bot' do
      post bot_nodes_path(bot), params: valid_params
      expect(Node.last.bot).to eq(bot)
    end

    it 'returns unprocessable entity with invalid params' do
      bot #instantiating the bot in advance so the creation of root node doesn't make the count change by 2 instead of 1
      expect {
        post bot_nodes_path(bot), params: invalid_params
      }.not_to change(Node, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe 'PATCH #update' do
    before { sign_in user }

    let(:valid_params) do
      {
        node: {
          data: { context: 'allies', query: 'is_attacking' }
        }
      }
    end

    it 'updates the node with valid params' do
      patch bot_node_path(bot, node), params: valid_params
      node.reload
      expect(node.data['context']).to eq('allies')
      expect(node.data['query']).to eq('is_attacking')
      expect(response).to have_http_status(:success)
    end

    it 'returns unprocessable entity with invalid params' do
      patch bot_node_path(bot, node), params: { node: { node_type: '' } }
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe 'DELETE #destroy' do
    before { sign_in user }

    it 'destroys the node' do
      node_to_delete = create(:node, bot: bot)
      expect {
        delete bot_node_path(bot, node_to_delete)
      }.to change(Node, :count).by(-1)
      expect(response).to have_http_status(:no_content)
    end

    it 'destroys associated connections' do
      node1 = create(:node, bot: bot)
      node2 = create(:node, bot: bot)
      create(:node_connection, :with_nodes, source_node: node1, target_node: node2)
      
      expect {
        delete bot_node_path(bot, node1)
      }.to change(NodeConnection, :count).by(-1)
    end
  end

  describe 'POST #update_position' do
    before { sign_in user }

    it 'updates the node position' do
      post update_position_bot_node_path(bot, node), params: { position_x: 150.5, position_y: 250.0 }
      node.reload
      expect(node.position_x).to eq(150.5)
      expect(node.position_y).to eq(250.0)
      expect(response).to have_http_status(:success)
    end

    it 'accepts nil position values' do
      post update_position_bot_node_path(bot, node), params: { position_x: nil, position_y: nil }
      expect(response).to have_http_status(:success)
      node.reload
      expect(node.position_x).to be_nil
      expect(node.position_y).to be_nil
    end
  end

  describe 'POST #connect' do
    before { sign_in user }

    let(:source_node) { create(:node, bot: bot) }
    let(:target_node) { create(:node, bot: bot) }

    it 'creates a connection between nodes' do
      expect {
        post connect_bot_node_path(bot, source_node), params: { target_id: target_node.id }
      }.to change(NodeConnection, :count).by(1)
      expect(response).to have_http_status(:created)
    end

    it 'returns unprocessable entity for invalid connection' do
      create(:node_connection, source_node: source_node, target_node: target_node)
      post connect_bot_node_path(bot, source_node), params: { target_id: target_node.id }
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'returns 404 when target node is not in the same bot' do
      other_bot = create(:bot)
      other_node = create(:node, bot: other_bot)
      expect {
        post connect_bot_node_path(bot, source_node), params: { target_id: other_node.id }
      }.to raise_error(ActiveRecord::RecordNotFound)
    end
  end

  describe 'DELETE #disconnect' do
    before { sign_in user }

    let(:source_node) { create(:node, bot: bot) }
    let(:target_node) { create(:node, bot: bot) }
    let!(:connection) { create(:node_connection, source_node: source_node, target_node: target_node) }

    it 'destroys the connection' do
      expect {
        delete bot_node_connection_path(bot, source_node, connection)
      }.to change(NodeConnection, :count).by(-1)
      expect(response).to have_http_status(:no_content)
    end
  end
end
