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
      expect { bot.destroy }.to change { Node.count }.by(-2)
      # -1 for the created node, -1 for the root node
    end

    it 'has many node_connections through nodes' do
      bot = create(:bot)
      node1 = create(:node, bot: bot)
      node2 = create(:node, bot: bot)
      connection = create(:node_connection, source_node: node1, target_node: node2)
      expect(bot.node_connections).to include(connection)
    end
  end

  describe 'root node lifecycle' do
    describe 'auto-creation on create' do
      it 'creates root node after bot is created' do
        bot = create(:bot)
        expect(bot.root_node).to be_present
        expect(bot.root_node.node_type).to eq('root')
      end

      it 'positions root at (600, 50)' do
        bot = create(:bot)
        root = bot.root_node
        expect(root.position_x).to eq(600)
        expect(root.position_y).to eq(50)
      end

      it 'sets root node data to empty hash' do
        bot = create(:bot)
        root = bot.root_node
        expect(root.data).to eq({})
      end
    end

    describe '#root_node finder' do
      it 'returns the root node' do
        bot = create(:bot)
        root = bot.root_node
        expect(root).to be_present
        expect(root.node_type).to eq('root')
      end
    end

    describe 'validation on update' do
      it 'prevents updating bot if root node is deleted' do
        bot = create(:bot)
        root = bot.root_node
        root.destroy

        bot.name = 'New Name'
        expect(bot).not_to be_valid
        expect(bot.errors[:base]).to include("Bot must have a root node")
      end

      it 'adds error "Bot must have a root node"' do
        bot = create(:bot)
        root = bot.root_node
        root.destroy

        bot.name = 'New Name'
        bot.valid?
        expect(bot.errors[:base]).to include("Bot must have a root node")
      end
    end

    describe 'deletion behavior' do
      it 'destroys root node when bot is destroyed' do
        bot = create(:bot)
        root_id = bot.root_node.id

        expect { bot.destroy }.to change { Node.where(id: root_id).count }.by(-1)
      end
    end
  end

  describe 'factory' do
    it 'has a valid factory' do
      expect(build(:bot)).to be_valid
    end

    it 'creates a bot with nodes' do
      bot = create(:bot, :with_nodes)
      expect(bot.nodes.count).to eq(4)
      # 1 root node + 3 additional nodes from trait
    end
  end
end
