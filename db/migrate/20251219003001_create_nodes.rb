class CreateNodes < ActiveRecord::Migration[7.1]
  def change
    create_table :nodes do |t|
      t.belongs_to :bot, null: false, foreign_key: true
      t.string :node_type, null: false # 'condition' or 'action'
      t.string :category, null: false   # e.g., 'piece_type', 'position', 'move', 'capture'
      t.json :data, default: {}         # stores parameters for the node
      t.float :position_x, default: 0
      t.float :position_y, default: 0
      t.boolean :is_root, default: false

      t.timestamps
    end
  end
end