class Users::SessionsController < Devise::SessionsController
  def require_no_authentication
    return if user_without_authenticating&.guest?

    super
  end

  def create
    sign_out(current_user) if current_user&.guest?
    super
  end

  private

  def after_sign_out_path_for(_resource_or_scope)
    signed_out_path
  end

  def user_without_authenticating
    warden.user(scope: :user)
  end
end
