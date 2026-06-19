require 'rails_helper'

RSpec.describe 'Signed out page', type: :request do
  describe 'GET /signed_out' do
    it 'renders for a logged-out visitor' do
      get signed_out_path

      expect(response).to have_http_status(:success)
    end
  end
end
