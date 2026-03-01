class BotsController < ApplicationController
  before_action :authenticate_user!, except: [:index]
  before_action :set_bot, only: [:edit, :update, :destroy]

  def index
    @bots = Bot.all
  end

  def new
    @bot = current_user.bots.new
  end

  def create
    @bot = current_user.bots.new(bot_params)
    
    if @bot.save
      redirect_to edit_bot_path(@bot), notice: 'Bot was successfully created.'
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
    @nodes = @bot.nodes.includes(:outgoing_connections, :incoming_connections)
    @connections = @bot.nodes.flat_map(&:outgoing_connections)
  end

  def update
    if @bot.update(bot_params)
      redirect_to edit_bot_path(@bot), notice: 'Bot was successfully updated.'
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @bot.destroy
    redirect_to bots_path, notice: 'Bot was successfully destroyed.'
  end

  private

  def set_bot
    @bot = current_user.bots.find(params[:id])
  end

  def bot_params
    params.require(:bot).permit(:name, :description, :commands)
  end
end
