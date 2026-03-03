# == Schema Information
#
# Table name: bots
#
#  id          :bigint           not null, primary key
#  commands    :json
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  user_id    :bigint           not null
#  name       :string
#  description :text
#
class Bot < ApplicationRecord
  
  belongs_to :user
  has_many :games
  has_many :nodes, dependent: :destroy
  has_many :node_connections, through: :nodes, source: :outgoing_connections

  validates :name, presence: true, uniqueness: true
  
  # Create root node after bot is created
  after_create :create_root_node
  
  # Validation to ensure root node exists (for existing bots)
  validate :must_have_root_node, on: :update, if: :requires_root_validation?
  
  # Get the root node for this bot
  def root_node
    nodes.find_by(node_type: 'root')
  end
  
  private
  
  def create_root_node
    nodes.create!(
      node_type: 'root',
      position_x: 600,  # Center of 1200px wide canvas (approx)
      position_y: 50,    # Near top
      data: {}
    )
  end
  
  def requires_root_validation?
    # Only validate if we're not in the middle of creating (after_create handles that)
    persisted? && nodes.where(node_type: 'root').empty?
  end
  
  def must_have_root_node
    errors.add(:base, "Bot must have a root node")
  end
end
