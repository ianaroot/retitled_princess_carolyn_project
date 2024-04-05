class HomeController < ApplicationController


    def index
        logger.debug "PRINTING"
      render "index"
    end
  end