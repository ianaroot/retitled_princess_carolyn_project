require 'rails_helper'

RSpec.describe Bot, type: :model do
  describe 'validations' do
    it 'is valid with a name' do
      bot = build(:bot)
      expect(bot).to be_valid
    end

    it 'is invalid without a name' do
      bot = build(:bot, name: nil)
      expect(bot).not_to be_valid
      expect(bot.errors[:name]).to include("can't be blank")
    end

    it 'is invalid with a duplicate name' do
      create(:bot, name: 'Test Bot')
      bot = build(:bot, name: 'Test Bot')
      expect(bot).not_to be_valid
      expect(bot.errors[:name]).to include("has already been taken")
    end

    it 'is valid without a description' do
      bot = build(:bot, description: nil)
      expect(bot).to be_valid
    end
  end

  describe 'associations' do
    it 'belongs to a user' do
      user = create(:user)
      bot = create(:bot, user: user)
      expect(bot.user).to eq(user)
    end

    it 'has many nodes' do
      bot = create(:bot)
      node1 = create(:node, bot: bot)
      node2 = create(:node, bot: bot)
      expect(bot.nodes).to include(node1, node2)
    end

    it 'destroys dependent nodes when destroyed' do
      bot = create(:bot)
      node = create(:node, bot: bot)
      expect { bot.destroy }.to change { Node.count }.by(-1)
    end

    it 'has many node_connections through nodes' do
      bot = create(:bot)
      node1 = create(:node, bot: bot)
      node2 = create(:node, bot: bot)
      connection = create(:node_connection, source_node: node1, target_node: node2)
      expect(bot.node_connections).to include(connection)
    end
  end

  describe 'factory' do
    it 'has a valid factory' do
      expect(build(:bot)).to be_valid
    end

    it 'creates a bot with nodes using the with_nodes trait' do
      bot = create(:bot, :with_nodes)
      expect(bot.nodes.count).to eq(3)
    end
  end
end
