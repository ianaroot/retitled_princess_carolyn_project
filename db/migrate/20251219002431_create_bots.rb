class CreateBots < ActiveRecord::Migration[7.1]
  def change
    create_table :bots do |t|
      t.belongs_to :user
      t.json :commands
  


      t.timestamps
    end
  end
end
