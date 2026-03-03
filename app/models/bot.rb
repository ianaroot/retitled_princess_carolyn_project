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
  
  after_create :create_root_node
  
  validate :root_node_must_exist, on: :update
  
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
  
  def root_node_must_exist
    errors.add(:base, "Bot must have a root node") unless root_node.present?
  end
end
