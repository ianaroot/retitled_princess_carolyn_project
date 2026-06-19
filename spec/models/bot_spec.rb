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

    it 'has many connections through nodes' do
      bot = create(:bot)
      node1 = create(:node, bot: bot)
      node2 = create(:node, bot: bot)
      connection = Connection.create!(source_node: node1, target_node: node2)
      expect(bot.connections).to include(connection)
    end

    it 'destroys open tournament entries when destroyed' do
      bot = create(:bot, :compiled)
      tournament = create(:tournament, status: :open)
      entry = create(:tournament_entry, tournament: tournament, bot: bot, seed_order: 0)

      bot.destroy!

      expect(TournamentEntry.exists?(entry.id)).to be(false)
    end

    it 'preserves non-open tournament entries when destroyed' do
      bot = create(:bot, :compiled)
      tournament = create(:tournament, status: :running)
      entry = create(
        :tournament_entry,
        tournament: tournament,
        bot: bot,
        display_name: bot.name,
        compiled_program_snapshot: bot.compiled_program,
        seed_order: 0
      )

      bot.destroy!

      expect(entry.reload.bot).to be_nil
      expect(entry.display_name).to eq(bot.name)
      expect(entry.compiled_program_snapshot).to eq(bot.compiled_program)
    end

    it 'preserves match-referenced open tournament entries when destroyed' do
      user = create(:user)
      bot = create(:bot, :compiled, user: user)
      opponent = create(:bot, :compiled)
      tournament = create(:tournament, creator: user, status: :open)
      entry = create(
        :tournament_entry,
        tournament: tournament,
        bot: bot,
        display_name: bot.name,
        compiled_program_snapshot: bot.compiled_program,
        seed_order: 0
      )
      opponent_entry = create(
        :tournament_entry,
        tournament: tournament,
        bot: opponent,
        display_name: opponent.name,
        compiled_program_snapshot: opponent.compiled_program,
        seed_order: 1
      )
      Match.create!(
        tournament: tournament,
        creator: user,
        white_player: bot,
        black_player: opponent,
        white_tournament_entry: entry,
        black_tournament_entry: opponent_entry
      )

      bot.destroy!

      expect(entry.reload.bot).to be_nil
    end
  end

  describe 'root node lifecycle' do
    describe 'auto-creation on create' do
      it 'creates root node after bot is created' do
        bot = create(:bot)
        expect(bot.root_node).to be_present
        expect(bot.root_node.node_type).to eq('root')
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
      it 'requires a root node when updating' do
        bot = create(:bot)
        root = bot.root_node
        root.destroy

        bot.name = 'New Name'
        expect(bot).not_to be_valid
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
    it 'creates a bot with nodes' do
      bot = create(:bot, :with_nodes)
      expect(bot.nodes.count).to eq(4)
      # 1 root node + 3 additional nodes from trait
    end
  end

  describe '.with_owner_username' do
    it 'matches bots whose owner username contains the term' do
      alice = create(:user, username: 'alice_smith')
      bob = create(:user, username: 'bob_jones')
      alice_bot = create(:bot, user: alice)
      create(:bot, user: bob)

      expect(Bot.with_owner_username('alice')).to contain_exactly(alice_bot)
    end
  end

  describe '#system?' do
    it 'is true only for the seed bot' do
      expect(build(:bot, name: Bot::SYSTEM_BOT_NAME).system?).to be(true)
      expect(build(:bot, name: 'Some Other Bot').system?).to be(false)
    end
  end

  describe '.sorted_by' do
    it 'sorts by rating high-to-low for elo_desc' do
      weak = create(:bot).tap { |b| b.update_column(:rating, 100) }
      strong = create(:bot).tap { |b| b.update_column(:rating, 2000) }

      expect(Bot.sorted_by('elo_desc').to_a).to eq([strong, weak])
    end

    it 'defaults to most-recently-updated first' do
      older = create(:bot).tap { |b| b.update_column(:updated_at, 2.days.ago) }
      newer = create(:bot).tap { |b| b.update_column(:updated_at, 1.hour.ago) }

      expect(Bot.sorted_by(nil).to_a).to eq([newer, older])
    end

    it 'toggles to oldest-updated first for recently_updated_asc' do
      older = create(:bot).tap { |b| b.update_column(:updated_at, 2.days.ago) }
      newer = create(:bot).tap { |b| b.update_column(:updated_at, 1.hour.ago) }

      expect(Bot.sorted_by('recently_updated_asc').to_a).to eq([older, newer])
    end

    it 'sorts alphabetically for name_asc' do
      bravo = create(:bot, name: 'Bravo')
      alpha = create(:bot, name: 'Alpha')

      expect(Bot.sorted_by('name_asc').to_a).to eq([alpha, bravo])
    end
  end

  describe '#get_fresh_program' do
    it 'returns a deep copy of compiled_program when fresh' do
      bot = create(:bot, :compiled)
      result = bot.get_fresh_program

      expect(result).to eq(bot.compiled_program)
      expect(result).not_to equal(bot.compiled_program)
    end

    it 'raises when compiled_program is blank' do
      bot = create(:bot)
      expect { bot.get_fresh_program }.to raise_error(RuntimeError, /has no compiled program/)
    end

    it 'raises when compiled_program is stale' do
      bot = create(:bot, :compiled)
      bot.update_column(:compiled_program_stale, true)
      expect { bot.get_fresh_program }.to raise_error(RuntimeError, /stale compiled program/)
    end
  end

  describe 'compiled program lifecycle' do
    it 'compiles a program and clears the stale flag' do
      bot = create(:bot)
      condition = create(:node, :condition, bot: bot)
      connect_nodes(bot.root_node, condition)

      bot.compile_program!
      bot.reload

      expect(bot.compiled_program).to be_present
      expect(bot.compiled_program_stale).to be(false)
    end

    it 'marks the bot stale when a node position changes' do
      bot = create(:bot)
      node = create(:node, :condition, bot: bot)
      connect_nodes(bot.root_node, node)
      bot.compile_program!

      node.update!(position_x: 999)
      expect(bot.reload.compiled_program_stale).to be(true)
    end

    it 'marks the bot stale when node data changes' do
      bot = create(:bot)
      node = create(:node, :condition, bot: bot)
      connect_nodes(bot.root_node, node)
      bot.compile_program!

      node.update!(data: {
        version: 2,
        kind: 'census',
        subject: 'moved_piece',
        subjectFilter: 'any',
        subjectFilterMode: 'include',
        operator: 'mobility',
        comparator: 'greater_than',
        target: 'exact_number',
        targetTotal: 0
      })

      expect(bot.reload.compiled_program_stale).to be(true)
    end

    it 'marks the bot stale when a connection is created or destroyed' do
      bot = create(:bot)
      source = create(:node, :condition, bot: bot)
      target = create(:node, :score, bot: bot)
      bot.compile_program!

      connection = Connection.create!(source_node: source, target_node: target)
      expect(bot.reload.compiled_program_stale).to be(true)

      bot.compile_program!
      connection.destroy!
      expect(bot.reload.compiled_program_stale).to be(true)
    end
  end

  describe '#compile_program! rating deviation' do
    it 'inflates deviation when the compiled program changes' do
      bot = create(:bot, :compiled)
      bot.update_columns(rating_deviation: 50.0)
      allow_any_instance_of(BotCompiler).to receive(:compile).and_return(root: 'root', nodes: { 'n1' => {} })

      expect { bot.compile_program! }.to(change { bot.reload.rating_deviation })
      expect(bot.rating_deviation).to be > 50.0
    end

    it 'leaves deviation unchanged when the recompiled program is identical' do
      bot = create(:bot, :compiled)
      bot.update_columns(rating_deviation: 50.0)
      allow_any_instance_of(BotCompiler).to receive(:compile).and_return(root: 'root', nodes: {})

      expect { bot.compile_program! }.not_to(change { bot.reload.rating_deviation })
    end

    it 'does not change the rating itself on recompile' do
      bot = create(:bot, :compiled)
      bot.update_columns(rating: 1200.0, rating_deviation: 50.0)
      allow_any_instance_of(BotCompiler).to receive(:compile).and_return(root: 'root', nodes: { 'n1' => {} })

      expect { bot.compile_program! }.not_to(change { bot.reload.rating })
    end

    it 'does not inflate on the first compile' do
      bot = create(:bot)
      bot.update_columns(rating_deviation: 50.0)
      allow_any_instance_of(BotCompiler).to receive(:compile).and_return(root: 'root', nodes: {})

      expect { bot.compile_program! }.not_to(change { bot.reload.rating_deviation })
    end
  end

  describe '#eligibility_for and #eligible_for?' do
    let(:bot) { create(:bot) }
    let(:one_score_program) { { "root" => "s1", "nodes" => { "s1" => { "type" => "score", "children" => [] } } } }

    before do
      bot.update_columns(compiled_program: one_score_program, compiled_program_stale: false)
    end

    it 'is eligible when there are no constraints' do
      expect(bot.eligible_for?(nil)).to be true
    end

    it 'returns a result object detailing violations against constraints' do
      result = bot.eligibility_for("max_score_nodes" => 0)

      expect(result).to be_a(Tournaments::BotEligibilityChecker::Result)
      expect(result.eligible?).to be false
      expect(result.violations.map { |v| v[:type] }).to include("max_score_nodes")
    end

    it 'eligible_for? mirrors the result object eligibility' do
      expect(bot.eligible_for?("max_score_nodes" => 0)).to be false
    end
  end
end
