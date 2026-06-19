require 'rails_helper'

RSpec.describe Matches::RematchOptions do
  describe '#human_vs_bot_params' do
    it 'offers a rematch against the human\'s own ready bot' do
      user = create(:user)
      bot = create(:bot, :compiled, user: user)
      match = create(:match, :human_vs_bot, white_player: user, black_player: bot)

      options = described_class.new(match: match, user: user)

      expect(options.human_vs_bot_params).to eq(bot_id: bot.id, human_color: 'random')
    end

    it 'offers a rematch against the seed bot even though it belongs to another user' do
      user = create(:user)
      seed = create(:bot, :compiled, name: Bot::SYSTEM_BOT_NAME)
      match = create(:match, :human_vs_bot, white_player: user, black_player: seed)

      options = described_class.new(match: match, user: user)

      expect(options.human_vs_bot_params).to eq(bot_id: seed.id, human_color: 'random')
      expect(options.human_vs_bot_unavailable_message).to be_nil
    end
  end

  describe '#human_vs_bot_unavailable_message' do
    it "blocks a rematch against another user's non-seed bot" do
      user = create(:user)
      other_bot = create(:bot, :compiled)
      match = create(:match, :human_vs_bot, white_player: user, black_player: other_bot)

      options = described_class.new(match: match, user: user)

      expect(options.human_vs_bot_params).to be_nil
      expect(options.human_vs_bot_unavailable_message)
        .to eq('Play again is unavailable because this bot belongs to another user.')
    end

    it 'asks to recompile a stale seed bot rather than claiming it belongs to another user' do
      user = create(:user)
      seed = create(:bot, :compiled, name: Bot::SYSTEM_BOT_NAME)
      seed.update_columns(compiled_program_stale: true)
      match = create(:match, :human_vs_bot, white_player: user, black_player: seed)

      options = described_class.new(match: match, user: user)

      expect(options.human_vs_bot_unavailable_message)
        .to eq('Play again is unavailable because this bot needs to be recompiled.')
    end
  end
end
