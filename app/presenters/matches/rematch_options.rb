class Matches::RematchOptions
  def initialize(match:, user:)
    @match = match
    @user = user
  end

  def bot_vs_bot_params
    return nil if !bot_vs_bot_match?
    owned_bots = bots.select { |bot| bot.user_id == user.id }
    return nil if owned_bots.empty?
    own_bot = owned_bots.first
    opponent_bot = bots.find { |bot| bot.id != own_bot.id } || own_bot
    {
      own_bot_id: own_bot.id,
      opponent_bot_id: opponent_bot.id
    }
  end

  def human_vs_bot_params
    return nil if !human_vs_bot_context?
    return nil unless own_or_system_bot?
    return nil if !bot_ready?
    {
      bot_id: bot.id,
      human_color: 'random'
    }
  end

  def human_vs_bot_unavailable_message
    return nil if !human_vs_bot_context?
    return nil if human_vs_bot_params.present?
    if bot.blank?
      'Play again is unavailable because the green chess goblin from this match has been deleted.'
    elsif !own_or_system_bot?
      'Play again is unavailable because this bot belongs to another user.'
    elsif bot.compiled_program_stale?
      'Play again is unavailable because this bot needs to be recompiled.'
    elsif bot.compiled_program.blank?
      'Play again is unavailable because this bot has no compiled program.'
    end
  end

  private

  attr_reader :match, :user

  def bots
    [match.white_player, match.black_player].select { |player| player.is_a?(Bot) }
  end

  def bot_vs_bot_match?
    match.white_player.is_a?(Bot) && match.black_player.is_a?(Bot)
  end

  def human_vs_bot_context?
    human_side.present? && (bot.present? || bot_snapshot.present?)
  end

  def human_side
    return :white if match.white_player == user
    return :black if match.black_player == user
    nil
  end

  def bot_side
    return nil if human_side.blank?
    human_side == :white ? :black : :white
  end

  def bot
    return nil if bot_side.blank?
    player = bot_side == :white ? match.white_player : match.black_player
    player if player.is_a?(Bot)
  end

  def bot_ready?
    bot.compiled_program.present? && !bot.compiled_program_stale?
  end

  def own_or_system_bot?
    bot && (bot.user_id == user.id || bot.system?)
  end

  def bot_snapshot
    return nil if bot_side.blank? || match.tournament.present?
    bot_side == :white ? match.white_compiled_program_snapshot : match.black_compiled_program_snapshot
  end
end
