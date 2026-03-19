class Game < ApplicationRecord
  # TODO: Discuss Game model implementation
  # 
  # Current state: This model exists but is completely unused.
  # Games are handled purely client-side in game_controller.js.
  # 
  # Questions to address:
  # 1. Should we persist game state to database?
  # 2. Should we track game history/results for bot performance analysis?
  # 3. Do we want multiplayer support requiring server-side game state?
  # 4. Should we remove this model entirely if it remains unused?
  # 
  # If implementing persistence, consider:
  # - Game state serialization (board position, move history)
  # - Bot vs Bot match results
  # - User game history
  # - Replay functionality
  #
  # If removing, also remove:
  # - games table migration
  # - GamesController
  # - routes for games
  
  belongs_to :bot_1, class_name: :Bot
  belongs_to :bot_2, class_name: :Bot
end