class Game < ApplicationRecord
  
  belongs_to :bot_1, class_name: :Bot
  belongs_to :bot_2, class_name: :Bot


end