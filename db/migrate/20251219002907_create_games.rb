class CreateGames < ActiveRecord::Migration[7.1]
  def change
    create_table :games do |t|
      t.belongs_to :bot_1, foreign_key: {to_table: :bots}
      t.belongs_to :bot_2, foreign_key: {to_table: :bots}

      t.json :layOut
      t.json :capturedPieces
      t.boolean :gameOver  
      t.boolean :allowedToMove
      t.json :movementNotation
      t.json :previousLayouts


      t.timestamps
    end
  end
end
