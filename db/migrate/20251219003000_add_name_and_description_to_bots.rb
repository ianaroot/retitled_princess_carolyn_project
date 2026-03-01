class AddNameAndDescriptionToBots < ActiveRecord::Migration[7.1]
  def change
    add_column :bots, :name, :string
    add_column :bots, :description, :text
  end
end
