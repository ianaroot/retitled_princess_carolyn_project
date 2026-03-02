require 'rails_helper'

RSpec.describe BotsController, type: :request do
  describe 'GET #index' do
    it 'returns success for unauthenticated users' do
      create_list(:bot, 3)
      get bots_path
      expect(response).to have_http_status(:success)
      expect(response.body).to include('Bots')
    end

    it 'returns success for authenticated users' do
      user = create(:user)
      sign_in user
      get bots_path
      expect(response).to have_http_status(:success)
    end
  end

  describe 'GET #new' do
    it 'redirects to login when not authenticated' do
      get new_bot_path
      expect(response).to redirect_to(new_user_session_path)
    end

    it 'returns success for authenticated users' do
      user = create(:user)
      sign_in user
      get new_bot_path
      expect(response).to have_http_status(:success)
    end
  end

  describe 'POST #create' do
    let(:valid_params) { { bot: { name: 'Test Bot', description: 'A test bot' } } }
    let(:invalid_params) { { bot: { name: '', description: 'A test bot' } } }

    it 'redirects to login when not authenticated' do
      post bots_path, params: valid_params
      expect(response).to redirect_to(new_user_session_path)
    end

    context 'when authenticated' do
      before do
        sign_in create(:user)
      end

      it 'creates a bot with valid params' do
        expect {
          post bots_path, params: valid_params
        }.to change(Bot, :count).by(1)
        expect(response).to redirect_to(edit_bot_path(Bot.last))
        expect(flash[:notice]).to eq('Bot was successfully created.')
      end

      it 'returns unprocessable entity with invalid params' do
        expect {
          post bots_path, params: invalid_params
        }.not_to change(Bot, :count)
        expect(response).to have_http_status(:unprocessable_entity)
      end

      it 'assigns the bot to the current user' do
        user = User.last
        post bots_path, params: valid_params
        expect(Bot.last.user).to eq(user)
      end
    end
  end

  describe 'GET #edit' do
    let(:bot) { create(:bot) }

    it 'redirects to login when not authenticated' do
      get edit_bot_path(bot)
      expect(response).to redirect_to(new_user_session_path)
    end

    it 'returns success for the bot owner' do
      sign_in bot.user
      get edit_bot_path(bot)
      expect(response).to have_http_status(:success)
    end

    it 'returns 404 for another users bot' do
      other_user = create(:user)
      sign_in other_user
      expect {
        get edit_bot_path(bot)
      }.to raise_error(ActiveRecord::RecordNotFound)
    end
  end

  describe 'PATCH #update' do
    let(:bot) { create(:bot) }
    let(:valid_params) { { bot: { name: 'Updated Name' } } }
    let(:invalid_params) { { bot: { name: '' } } }

    it 'redirects to login when not authenticated' do
      patch bot_path(bot), params: valid_params
      expect(response).to redirect_to(new_user_session_path)
    end

    context 'when authenticated as owner' do
      before { sign_in bot.user }

      it 'updates the bot with valid params' do
        patch bot_path(bot), params: valid_params
        bot.reload
        expect(bot.name).to eq('Updated Name')
        expect(response).to redirect_to(edit_bot_path(bot))
        expect(flash[:notice]).to eq('Bot was successfully updated.')
      end

      it 'returns unprocessable entity with invalid params' do
        patch bot_path(bot), params: invalid_params
        expect(response).to have_http_status(:unprocessable_entity)
      end
    end
  end

  describe 'DELETE #destroy' do
    let!(:bot) { create(:bot) }

    it 'redirects to login when not authenticated' do
      delete bot_path(bot)
      expect(response).to redirect_to(new_user_session_path)
    end

    it 'destroys the bot for the owner' do
      sign_in bot.user
      expect {
        delete bot_path(bot)
      }.to change(Bot, :count).by(-1)
      expect(response).to redirect_to(bots_path)
      expect(flash[:notice]).to eq('Bot was successfully destroyed.')
    end

    it 'returns 404 for another users bot' do
      other_user = create(:user)
      sign_in other_user
      expect {
        delete bot_path(bot)
      }.to raise_error(ActiveRecord::RecordNotFound)
    end
  end
end
