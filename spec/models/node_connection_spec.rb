require 'rails_helper'

RSpec.describe NodeConnection, type: :model do
  describe 'validations' do
    it 'is valid with source_node and target_node' do
      connection = build(:node_connection, :with_nodes)
      expect(connection).to be_valid
    end

    it 'is invalid without a source_node' do
      connection = build(:node_connection, source_node: nil)
      expect(connection).not_to be_valid
      expect(connection.errors[:source_node]).to include("must exist")
    end

    it 'is invalid without a target_node' do
      connection = build(:node_connection, target_node: nil)
      expect(connection).not_to be_valid
      expect(connection.errors[:target_node]).to include("must exist")
    end

    it 'is invalid with duplicate source_node_id and target_node_id' do
      node1 = create(:node)
      node2 = create(:node, bot: node1.bot)
      create(:node_connection, source_node: node1, target_node: node2)
      
      duplicate = build(:node_connection, source_node: node1, target_node: node2)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:source_node_id]).to include("connection already exists")
    end

    it 'allows multiple connections from the same source to different targets' do
      node1 = create(:node)
      node2 = create(:node, bot: node1.bot)
      node3 = create(:node, bot: node1.bot)
      
      create(:node_connection, source_node: node1, target_node: node2)
      connection2 = build(:node_connection, source_node: node1, target_node: node3)
      
      expect(connection2).to be_valid
    end

    it 'allows multiple connections from different sources to the same target' do
      node1 = create(:node)
      node2 = create(:node, bot: node1.bot)
      node3 = create(:node, bot: node1.bot)
      
      create(:node_connection, source_node: node1, target_node: node3)
      connection2 = build(:node_connection, source_node: node2, target_node: node3)
      
      expect(connection2).to be_valid
    end
  end

  describe 'associations' do
    it 'belongs to a source_node' do
      node = create(:node)
      connection = create(:node_connection, :with_nodes, source_node: node)
      expect(connection.source_node).to eq(node)
    end

    it 'belongs to a target_node' do
      node = create(:node)
      connection = create(:node_connection, :with_nodes, target_node: node)
      expect(connection.target_node).to eq(node)
    end
  end

  describe 'factory' do
    it 'has a valid factory' do
      expect(build(:node_connection, :with_nodes)).to be_valid
    end

    it 'ensures nodes belong to the same bot' do
      bot = create(:bot)
      connection = create(:node_connection, :with_nodes, bot: bot)
      expect(connection.source_node.bot).to eq(connection.target_node.bot)
    end
  end
end
