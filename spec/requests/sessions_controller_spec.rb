require 'rails_helper'

RSpec.describe Users::SessionsController, type: :request do
  describe 'POST #create' do
    it 'signs in a logged-out user without the already-authenticated bounce' do
      user = create(:user)

      post user_session_path, params: { user: { email: user.email, password: 'password123' } }

      expect(flash[:alert]).not_to eq(I18n.t('devise.failure.already_authenticated'))

      get edit_user_registration_path
      expect(response).to have_http_status(:success) # reached an auth-only page => actually signed in
    end
  end

  describe 'GET #new' do
    it 'lets a signed-in guest open the sign-in form' do
      sign_in create(:user, :guest)

      get new_user_session_path

      expect(response).to have_http_status(:success)
    end
  end

  describe 'DELETE #destroy' do
    it 'redirects to the signed-out page instead of the bots index' do
      sign_in create(:user)

      delete destroy_user_session_path

      expect(response).to redirect_to(signed_out_path)
    end
  end
end
