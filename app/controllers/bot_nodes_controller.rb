class BotNodesController < ApplicationController
  before_action :authenticate_user!
  before_action :set_bot
  before_action :set_node, only: [:show, :edit, :update, :destroy, :update_position]

  def show
    respond_to do |format|
      format.html { render partial: 'bots/nodes/preview', locals: { node: @node } }
      format.json { render json: @node }
    end
  end

  def edit
    render json: @node
  end

  def create
    @node = @bot.nodes.new(node_params)
    
    if @node.save
      render json: @node, status: :created
    else
      render json: @node.errors, status: :unprocessable_entity
    end
  end

  def update
    if @node.update(node_params)
      render json: @node
    else
      render json: @node.errors, status: :unprocessable_entity
    end
  end

  def destroy
    @node.destroy
    head :no_content
  end

  def update_position
    if @node.update(position_x: params[:position_x], position_y: params[:position_y])
      render json: @node
    else
      render json: @node.errors, status: :unprocessable_entity
    end
  end

  def connect
    source_node = @bot.nodes.find(params[:id])
    target_node = @bot.nodes.find(params[:target_id])
    
    connection = NodeConnection.new(
      source_node: source_node,
      target_node: target_node
    )

    if connection.save
      render json: connection, status: :created
    else
      render json: connection.errors, status: :unprocessable_entity
    end
  end

  def disconnect
    connection = NodeConnection.find(params[:id])
    if connection.source_node.bot_id == @bot.id || connection.target_node.bot_id == @bot.id
      connection.destroy
      head :no_content
    else
      head :forbidden
    end
  end

  private

  def set_bot
    @bot = current_user.bots.find(params[:bot_id])
  end

  def set_node
    @node = @bot.nodes.find(params[:id])
  end

  def node_params
    params.require(:node).permit(:node_type, :position_x, :position_y, :is_root, data: {})
  end
end
