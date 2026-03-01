Rails.application.routes.draw do
  devise_for :users
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  
  root to: "home#index" 

  resources :bots, except: :show do
    resources :nodes, controller: 'bot_nodes', except: [:index, :new] do
      member do
        post :connect
        post :update_position
      end
    end
    delete 'nodes/:node_id/connections/:id', to: 'bot_nodes#disconnect', as: :node_connection
  end

  resources :games, only: [:new]

  # Defines the root path route ("/")
  # root "posts#index"
end
