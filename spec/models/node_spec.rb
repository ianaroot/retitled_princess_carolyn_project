require 'rails_helper'

RSpec.describe Node, type: :model do
  describe 'validations' do
    it 'is valid with a node_type' do
      node = build(:node)
      expect(node).to be_valid
    end

    it 'is invalid without a node_type' do
      node = build(:node, node_type: nil)
      expect(node).not_to be_valid
      expect(node.errors[:node_type]).to include("can't be blank")
    end

    it 'is valid with position_x and position_y' do
      node = build(:node, position_x: 150.5, position_y: 200.0)
      expect(node).to be_valid
    end

    it 'has default position values' do
      node = Node.new(node_type: 'condition', bot: create(:bot))
      expect(node.position_x).to eq(0.0)
      expect(node.position_y).to eq(0.0)
    end

    it 'is valid with empty data hash' do
      node = build(:node, data: {})
      expect(node).to be_valid
    end

    it 'is valid with nil data' do
      node = build(:node, data: nil)
      expect(node).to be_valid
    end
  end

  describe 'associations' do
    it 'belongs to a bot' do
      bot = create(:bot)
      node = create(:node, bot: bot)
      expect(node.bot).to eq(bot)
    end

    it 'has many outgoing connections' do
      node1 = create(:node)
      node2 = create(:node, bot: node1.bot)
      connection = create(:node_connection, source_node: node1, target_node: node2)
      expect(node1.outgoing_connections).to include(connection)
    end

    it 'has many incoming connections' do
      node1 = create(:node)
      node2 = create(:node, bot: node1.bot)
      connection = create(:node_connection, source_node: node1, target_node: node2)
      expect(node2.incoming_connections).to include(connection)
    end

    it 'destroys dependent outgoing connections when destroyed' do
      node1 = create(:node)
      node2 = create(:node, bot: node1.bot)
      create(:node_connection, source_node: node1, target_node: node2)
      expect { node1.destroy }.to change { NodeConnection.count }.by(-1)
    end

    it 'destroys dependent incoming connections when destroyed' do
      node1 = create(:node)
      node2 = create(:node, bot: node1.bot)
      create(:node_connection, source_node: node1, target_node: node2)
      expect { node2.destroy }.to change { NodeConnection.count }.by(-1)
    end
  end

  describe 'node types' do
    it 'can be a condition node' do
      node = build(:node, :condition)
      expect(node.node_type).to eq('condition')
      expect(node).to be_valid
    end

    it 'can be an action node' do
      node = build(:node, :action)
      expect(node.node_type).to eq('action')
      expect(node).to be_valid
    end

    it 'can be a root node' do
      node = build(:node, :root)
      expect(node.node_type).to eq('root')
      expect(node).to be_valid
    end
  end

  describe 'root node type' do
    describe '#root? helper' do
      it 'returns true for root nodes' do
        node = build(:node, :root)
        expect(node.root?).to be true
      end

      it 'returns false for condition nodes' do
        node = build(:node, :condition)
        expect(node.root?).to be false
      end

      it 'returns false for action nodes' do
        node = build(:node, :action)
        expect(node.root?).to be false
      end
    end

    describe 'uniqueness validation' do
      it 'prevents creating second root node for same bot' do
        bot = create(:bot)
        expect(bot.root_node).to be_present

        second_root = build(:node, :root, bot: bot)
        expect(second_root).not_to be_valid
        expect(second_root.errors[:node_type]).to include("bot already has a root node")
      end

      it 'allows updating existing root node without error' do
        bot = create(:bot)
        root = bot.root_node

        root.position_x = 500
        expect(root).to be_valid
        expect { root.save! }.not_to raise_error
      end
    end
  end

  describe 'factory' do
    it 'has a valid factory' do
      expect(build(:node)).to be_valid
    end

    it 'has a condition trait' do
      node = build(:node, :condition)
      expect(node.data).to include('context' => 'self', 'query' => 'is_attacked')
    end

    it 'has an action trait' do
      node = build(:node, :action)
      expect(node.data).to include('action_type' => 'move')
    end
  end
end
