# == Schema Information
#
# Table name: bots
#
#  id                     :bigint           not null, primary key
#  user_id                :bigint
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  name                   :string
#  description            :text
#  compiled_program       :json
#  compiled_program_stale :boolean          default(TRUE), not null
#  rating                 :float            default(1000.0), not null
#  rating_deviation       :float            default(350.0), not null
#  rating_volatility      :float            default(0.06), not null
#
class Bot < ApplicationRecord
  SYSTEM_BOT_NAME = 'Seed Bot'
  RECOMPILE_RD_BUMP = 250.0

  belongs_to :user
  has_many :matches_as_white_player, as: :white_player, class_name: 'Match', dependent: :nullify
  has_many :matches_as_black_player, as: :black_player, class_name: 'Match', dependent: :nullify
  has_many :tournament_entries, dependent: :nullify
  has_many :tournaments, through: :tournament_entries
  has_many :nodes, dependent: :destroy
  has_many :connections, through: :nodes, source: :outgoing_connections

  scope :compiled,             ->         { where(compiled_program_stale: false).where.not(compiled_program: nil) }
  scope :stale,                ->         { where(compiled_program_stale: true) }
  scope :with_name,            ->(name)   { where("bots.name ILIKE ?", "%#{name}%") }
  scope :with_owner_username,  ->(owner)  { joins(:user).where("users.username ILIKE ?", "%#{owner}%") }

  SORT_ORDERS = {
    'name_asc'              => { name: :asc },
    'name_desc'             => { name: :desc },
    'elo_asc'               => { rating: :asc },
    'elo_desc'              => { rating: :desc },
    'recently_updated_asc'  => { updated_at: :asc },
    'recently_updated_desc' => { updated_at: :desc }
  }.freeze
  DEFAULT_SORT = 'recently_updated_desc'

  scope :sorted_by, ->(key) { order(SORT_ORDERS.fetch(key, SORT_ORDERS[DEFAULT_SORT])) }
  scope :with_compiled_status, ->(status) {
    case status
    when 'compiled' then compiled
    when 'stale'    then stale
    end
  }
  scope :filtered, ->(name: nil, compiled_status: nil) {
    scope = all
    scope = scope.with_name(name)                       if name.present?
    scope = scope.with_compiled_status(compiled_status) if compiled_status.present?
    scope
  }

  validates :name, presence: true, uniqueness: true
  
  before_destroy :destroy_open_tournament_entries, prepend: true
  after_create :create_root_node
  
  validate :root_node_must_exist, on: :update

  def self.system_bot
    find_by(name: SYSTEM_BOT_NAME)
  end

  def system?
    name == SYSTEM_BOT_NAME
  end

  def self.mark_stale_for(bot_id)
    find_by(id: bot_id)&.mark_compiled_program_stale!
  end

  def root_node
    nodes.find_by(node_type: 'root')
  end

  def compile_program!
    new_program = BotCompiler.new(self).compile
    changed = compiled_program.present? && new_program.as_json != compiled_program
    update_columns(compiled_program: new_program, compiled_program_stale: false)
    inflate_deviation_for_recompile! if changed
  end

  def mark_compiled_program_stale!
    return unless persisted?
    return if compiled_program_stale?
    update_column(:compiled_program_stale, true)
  end

  def get_fresh_program
    raise "Bot: #{id} has no compiled program" if compiled_program.blank?
    raise "Bot: #{id} has a stale compiled program and must be recompiled" if compiled_program_stale?
    compiled_program.deep_dup
  end

  def rating_state
    Glicko2::Rating.new(rating: rating, deviation: rating_deviation, volatility: rating_volatility)
  end

  def apply_rating!(state)
    update_columns(rating: state.rating, rating_deviation: state.deviation, rating_volatility: state.volatility)
  end

  def eligibility_for(constraints)
    Tournaments::BotEligibilityChecker.new(compiled_program, constraints).check
  end

  def eligible_for?(constraints)
    eligibility_for(constraints).eligible?
  end

  private

  def inflate_deviation_for_recompile!
    with_lock { apply_rating!(rating_state.with_inflated_deviation(RECOMPILE_RD_BUMP)) }
  end

  def destroy_open_tournament_entries
    tournament_entries
      .joins(:tournament)
      .where(tournaments: { status: Tournament.statuses.fetch('open') })
      .find_each do |entry|
        entry.destroy! unless tournament_entry_referenced_by_match?(entry)
      end
  end

  def tournament_entry_referenced_by_match?(entry)
    Match.where(white_tournament_entry_id: entry.id)
      .or(Match.where(black_tournament_entry_id: entry.id))
      .exists?
  end
  
  def create_root_node
    nodes.create!(
      node_type: 'root',
      position_x: 600,  # Center of 1200px wide canvas (approx)
      position_y: 50,    # Near top
      data: {}
    )
  end
  
  def root_node_must_exist
    errors.add(:base, "Bot must have a root node") unless root_node.present?
  end
end
