// Configure your import map in config/importmap.rb. Read more: https://github.com/rails/importmap-rails
import "@hotwired/turbo-rails"
import "controllers"
import Api from "gameplay/api"
import Board from "gameplay/board"
import Bot from "gameplay/bot"
import GameController from "gameplay/game_controller"
import Layout from "gameplay/layout"
import MoveObject from "gameplay/move_object"
import MovementType from "gameplay/movement_type"
import MovesCalculator from "gameplay/moves_calculator"
import Rules from "gameplay/rules"
import View from "gameplay/view"

// var gameController = new GameController()
// window.addEventListener('load', function () {
//     var gameController = new GameController()
// })

document.addEventListener('turbo:load', () => {
    var gameController = new GameController()
  });
  