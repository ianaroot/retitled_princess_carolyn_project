class AddUniqueIndexToBotsName < ActiveRecord::Migration[7.0]
  def change
    add_index :bots, :name, unique: true
  end
end
