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
  has_many :node_connections, through: :nodes

  validates :name, presence: true

end