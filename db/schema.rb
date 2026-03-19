# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

<<<<<<< HEAD
ActiveRecord::Schema[7.1].define(version: 2026_03_04_200000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "bots", force: :cascade do |t|
    t.bigint "user_id"
    t.json "commands"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "name"
    t.text "description"
    t.index ["name"], name: "index_bots_on_name", unique: true
    t.index ["user_id"], name: "index_bots_on_user_id"
  end

  create_table "games", force: :cascade do |t|
    t.bigint "bot_1_id"
    t.bigint "bot_2_id"
    t.json "layOut"
    t.json "capturedPieces"
    t.boolean "gameOver"
    t.boolean "allowedToMove"
    t.json "movementNotation"
    t.json "previousLayouts"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bot_1_id"], name: "index_games_on_bot_1_id"
    t.index ["bot_2_id"], name: "index_games_on_bot_2_id"
  end

  create_table "node_connections", force: :cascade do |t|
    t.bigint "source_node_id", null: false
    t.bigint "target_node_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "LEAST(source_node_id, target_node_id), GREATEST(source_node_id, target_node_id)", name: "idx_no_bidirectional_connections", unique: true
    t.index ["source_node_id", "target_node_id"], name: "index_node_connections_on_source_node_id_and_target_node_id", unique: true
    t.index ["source_node_id"], name: "index_node_connections_on_source_node_id"
    t.index ["target_node_id"], name: "index_node_connections_on_target_node_id"
    t.check_constraint "source_node_id <> target_node_id", name: "no_self_loops"
  end

  create_table "nodes", force: :cascade do |t|
    t.bigint "bot_id", null: false
    t.string "node_type", null: false
    t.json "data", default: {}
    t.float "position_x", default: 0.0
    t.float "position_y", default: 0.0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bot_id"], name: "index_nodes_on_bot_id"
    t.index ["bot_id"], name: "index_nodes_on_bot_id_root_unique", unique: true, where: "((node_type)::text = 'root'::text)"
    t.check_constraint "node_type::text = ANY (ARRAY['condition'::character varying, 'action'::character varying, 'root'::character varying, 'connector'::character varying]::text[])", name: "node_type_check"
  end

  create_table "users", force: :cascade do |t|
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

end
