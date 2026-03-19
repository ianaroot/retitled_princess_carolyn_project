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
    # Prevent deletion of root nodes
    if @node.root?
      render json: { error: "Cannot delete root node" }, status: :unprocessable_entity
      return
    end
    
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

  def batch_update_positions
    positions = params[:nodes] || []
    
    begin
      Node.transaction do
        positions.each do |node_data|
          node = @bot.nodes.find(node_data[:id])
          node.update!(position_x: node_data[:x], position_y: node_data[:y])
        end
      end
      head :ok
    rescue ActiveRecord::RecordNotFound => e
      render json: { error: "Node not found: #{e.message}" }, status: :not_found
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: e.message }, status: :unprocessable_entity
    end
  end

  def connect
    source_node = @bot.nodes.find(params[:id])
    target_node = @bot.nodes.find(params[:target_id])
    
    # Prevent connecting TO a root node (root can only have outgoing connections)
    if target_node.root?
      render json: { error: "Cannot connect to root node" }, status: :unprocessable_entity
      return
    end
    
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
    params.require(:node).permit(:node_type, :position_x, :position_y, data: {})
  end
end
