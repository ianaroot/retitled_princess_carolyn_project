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
ianroot:retitled_princess_carolyn_project (main) % git show a2a3585:db/migrate/2025121900
fatal: path 'db/migrate/2025121900' does not exist in 'a2a3585'
ianroot:retitled_princess_carolyn_project (main) % git show a2a3585:db/migrate/20251219003000_add_name_and_description_to_bots.rb
class AddNameAndDescriptionToBots < ActiveRecord::Migration[7.1]
  def change
    add_column :bots, :name, :string
    add_column :bots, :description, :text
  end
end
