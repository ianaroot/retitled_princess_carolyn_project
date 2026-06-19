require 'rails_helper'

RSpec.describe Users::RegistrationsController, type: :request do
  describe 'GET #new' do
    it 'allows guest users to open the registration form' do
      guest = create(:user, :guest)
      sign_in guest

      get new_user_registration_path

      expect(response).to have_http_status(:success)
    end

    it 'keeps registered users out of the registration form' do
      user = create(:user)
      sign_in user

      get new_user_registration_path

      expect(response).to redirect_to(root_path)
      expect(flash[:alert]).to eq(I18n.t('devise.failure.already_authenticated'))
    end

    it 'renders a username field' do
      get new_user_registration_path

      expect(response.body).to include('name="user[username]"')
    end
  end

  describe 'GET #edit' do
    it 'renders a username field' do
      user = create(:user)
      sign_in user

      get edit_user_registration_path

      expect(response.body).to include('name="user[username]"')
    end
  end

  describe 'POST #create' do
    let(:registration_params) do
      {
        user: {
          email: 'new-user@example.com',
          password: 'password123',
          password_confirmation: 'password123'
        }
      }
    end

    it 'creates a registered user when no guest is signed in' do
      expect {
        post user_registration_path, params: registration_params
      }.to change { User.where(guest: false).count }.by(1)

      user = User.find_by!(email: 'new-user@example.com')
      expect(user).not_to be_guest
    end

    it 'converts the signed-in guest instead of creating a new user' do
      guest = create(:user, :guest)
      sign_in guest

      expect {
        post user_registration_path, params: registration_params
      }.not_to change(User, :count)

      expect(response).to redirect_to(root_path)
      expect(guest.reload).not_to be_guest
      expect(guest.email).to eq('new-user@example.com')
    end

    it 'preserves guest-owned bots when converting to a registered user' do
      guest = create(:user, :guest)
      bot = create(:bot, user: guest)
      sign_in guest

      post user_registration_path, params: registration_params

      expect(bot.reload.user).to eq(guest.reload)
      expect(guest).not_to be_guest
    end

    it 'keeps the converted guest signed in as the same user' do
      guest = create(:user, :guest)
      bot = create(:bot, user: guest)
      sign_in guest

      post user_registration_path, params: registration_params
      get edit_bot_path(bot)

      expect(response).to have_http_status(:success)
    end

    it 'assigns a chosen username at sign up' do
      post user_registration_path, params: {
        user: {
          email: 'picky@example.com',
          username: 'picky_pete',
          password: 'password123',
          password_confirmation: 'password123'
        }
      }

      expect(User.find_by!(email: 'picky@example.com').username).to eq('picky_pete')
    end

    it 'derives a username from the email when none is given at sign up' do
      post user_registration_path, params: registration_params

      expect(User.find_by!(email: 'new-user@example.com').username).to eq('new-user')
    end

    it 'regenerates the username from the new email when a guest formalizes without one' do
      guest = create(:user, :guest)
      sign_in guest

      post user_registration_path, params: registration_params

      expect(guest.reload.username).to eq('new-user')
    end

    it 'keeps a username a formalizing guest chooses' do
      guest = create(:user, :guest)
      sign_in guest

      post user_registration_path, params: {
        user: {
          email: 'new-user@example.com',
          username: 'fresh_handle',
          password: 'password123',
          password_confirmation: 'password123'
        }
      }

      expect(guest.reload.username).to eq('fresh_handle')
    end

    it 'leaves the guest signed in and unchanged when the requested email is already taken' do
      existing_user = create(:user, email: 'taken@example.com')
      guest = create(:user, :guest)
      original_email = guest.email
      sign_in guest

      expect {
        post user_registration_path, params: {
          user: {
            email: existing_user.email,
            password: 'password123',
            password_confirmation: 'password123'
          }
        }
      }.not_to change(User, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(guest.reload).to be_guest
      expect(guest.email).to eq(original_email)

      get edit_user_registration_path
      expect(response).to have_http_status(:success)
    end

    it 'leaves the guest signed in and unchanged when the requested username is already taken' do
      create(:user, username: 'taken_handle')
      guest = create(:user, :guest)
      original_email = guest.email
      original_username = guest.username
      sign_in guest

      expect {
        post user_registration_path, params: {
          user: {
            email: 'fresh@example.com',
            username: 'taken_handle',
            password: 'password123',
            password_confirmation: 'password123'
          }
        }
      }.not_to change(User, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(guest.reload).to be_guest
      expect(guest.username).to eq(original_username)
      expect(guest.email).to eq(original_email)

      get edit_user_registration_path
      expect(response).to have_http_status(:success)
    end
  end

  describe 'PUT #update' do
    it 'updates the username' do
      user = create(:user, password: 'password123')
      sign_in user

      put user_registration_path, params: {
        user: { username: 'renamed_user', current_password: 'password123' }
      }

      expect(user.reload.username).to eq('renamed_user')
    end
  end
end
