import Board from "gameplay/board"
import Rules from "gameplay/rules"

class View{
  constructor(_gameController){
    this.boundHighlightTile = this.highlightTile.bind(this)
    this.boundAttemptMove = this.attemptMove.bind(this)
    this._gameController = _gameController
    this.unicodePieces = {
      WK: '\&#9812',
      BK: '\&#9818',
      WQ: '\&#9813',
      BQ: '\&#9819',
      WR: '\&#9814',
      BR: '\&#9820',
      WB: '\&#9815',
      BB: '\&#9821',
      WN: '\&#9816',
      BN: '\&#9822',
      WP: '\&#9817',
      BP: '\&#9823'
    };
  }

  static get TILE_HEIGHT() { return "49" }

  displayAlerts(message){
    // if(messages){
    //   for (let i = 0; i < messages.length; i++){
        document.getElementById( 'notifications' ).innerHTML = message//s[i];
    //   };
    // }
  };
  clearAlerts(){
    document.getElementById( 'notifications' ).innerHTML = "";
  };
  undisplayPiece(gridPosition){
    // let element = document.getElementById( gridPosition ),
    //   children  = element.children;
    // for( let i = 0; i < children.length; i ++){
    //   children[i].remove()
    // };

    let element = document.getElementById( gridPosition );
    element.innerHTML = ""
    element.classList.remove(Board.WHITE)
    element.classList.remove(Board.BLACK)
  };
  displayPiece(args){
    // let elem = document.createElement("img"),
    //   pieceInitials = args["pieceInitials"],
    //   gridPosition = args["gridPosition"];
    // elem.setAttribute("src", this.pieceImgSrc( pieceInitials ) );
    // elem.setAttribute("height", View.TILE_HEIGHT);
    // elem.setAttribute("width", View.TILE_HEIGHT);
    // let element = document.getElementById( gridPosition );
    // element.appendChild(elem)
    
    let  gridPosition = args["gridPosition"],
      pieceInitials = args["pieceInitials"],
      element = document.getElementById( gridPosition ),
      pieceImage = this.unicodePieces[pieceInitials];
    element.innerHTML = pieceImage;
    element.classList.add(pieceInitials[0])
    // TODO sort of magic string like...both above and below
    element.style.color = "black"

  };

  displayLayOut(args){

    let board = args["board"],
        alert = args["alert"] || "",
        layOut = board.layOut;
    for( let i = 0; i < layOut.length; i++){
      let gridPosition = Board.gridCalculator(i),
          pieceInitials = this.pieceInitials(layOut[i]);
      this.undisplayPiece(gridPosition);
      let pieceObject = board.pieceObject( i )
      if( Board.parseTeam( pieceObject) !== Board.EMPTY ){
        this.displayPiece({pieceInitials: pieceInitials, gridPosition: gridPosition})
      };
    };
    this.setTileClickListener();
    this.blackCaptureDivNeedsExpanding(board);
    this.whiteCaptureDivNeedsExpanding(board);
    this.updateCaptures(board);
    this.clearAlerts();
		this.updateTeamAllowedToMove(board);
    this.displayAlerts(alert)
  };
  pieceImgSrc(pieceInitials){
    // return "./chesspieces/" + pieceInitials + ".png"
   
    // return  "<%= asset_path('#{pieceInitials}.png') %>"
  };
  pieceInitials(pieceObject){
    let firstInitial = Board.parseTeam( pieceObject ),
      secondInitial = Board.parseSpecies(pieceObject);
    return firstInitial + secondInitial
  };
  highlightTile(){
    if(!this._gameController.board.gameOver){
      let target = arguments[0].currentTarget,
      // img = target.children[0],
      position = Board.gridCalculatorReverse( target.id ),
      team = Board.EMPTY;
      this.unhighlLighTiles();
      this.setTileClickListener();
      if (target.classList.contains(Board.BLACK) || target.classList.contains(Board.WHITE) ) {
        // team = this.teamSet(img.src)
        team = this.teamSet(target.classList)
        if (team === this._gameController.board.allowedToMove){
          let viables = Rules.viablePositionsFromKeysOnly( {startPosition: position, board: this._gameController.board } )
          for (let i = 0; i < viables.length; i++){
            let tilePosition = viables[i],
            alphaNumericPosition = Board.gridCalculator(tilePosition),
            square = document.getElementById(alphaNumericPosition);
            square.classList.add("highlight2")
            square.removeEventListener("click", this.boundHighlightTile )
            square.addEventListener("click", this.boundAttemptMove )
          }
          target.classList.add("highlight1")
          target.classList.add("startPosition");
        }
      }
    }
  }
  retrieveTiles(){
    return document.getElementsByClassName("chess-tile")
  }
  // teamSet(src){
  //     let regex = /(\w)[A-Z]\.png$/,
  //     teamInitial = src.match(regex)[1];
  //   if( teamInitial === "B"){
  //     return Board.BLACK;
  //   }else if (teamInitial === "W") {
  //     return Board.WHITE;
  //   }else {
  //     throw new Error("error in teamSet")
  //   }
  // }
  teamSet(list){
    if( list.contains(Board.BLACK)){
      return Board.BLACK;
    }else if (list.contains(Board.WHITE)) {
      return Board.WHITE;
    }else {
      throw new Error("error in teamSet")
    }
  }
  unhighlLighTiles(){
    let tiles = this.retrieveTiles();
    for(let i = 0 ; i < tiles.length ; i++ ){
    	var tile = tiles[i];
      tile.removeEventListener("click", this.boundHighlightTile);
      tile.removeEventListener("click", this.boundAttemptMove);
      tile.classList.remove("startPosition");
    	tile.classList.remove("highlight1");
    	tile.classList.remove("highlight2");
    }
  }
  updateTeamAllowedToMove(board){
    let span = document.getElementById("team-allowed-to-move");
    span.innerText = board.allowedToMove
  }
  updateCaptures(board){
    let blackCaptureDiv = document.getElementById("B-captures"),
      whiteCaptureDiv = document.getElementById("W-captures"),
      capturedPieces = board.capturedPieces;
    blackCaptureDiv.innerHTML = "<br><br><br>";
    whiteCaptureDiv.innerHTML = "<br><br><br>";
    for (let i = 0; i < capturedPieces.length; i++){
      let pieceObject = capturedPieces[i],
        team = Board.parseTeam( pieceObject ),
        pieceInitials = this.pieceInitials(pieceObject);
      this.displayPiece({pieceInitials: pieceInitials, gridPosition: team + "-captures"})
    }
  }
  attemptMove(){
    let target = arguments[0].currentTarget,
      endPosition = Board.gridCalculatorReverse( target.id ),
      startElement = document.getElementsByClassName("startPosition")[0],
      startPosition = Board.gridCalculatorReverse( startElement.id );
    this.unhighlLighTiles();
    this.setTileClickListener();
    this._gameController.attemptMove(startPosition, endPosition);
  }
  setTileClickListener(){
    let tiles = this.retrieveTiles();
    for(let i = 0 ; i < tiles.length ; i++ ){
    	var tile = tiles[i];
    	tile.addEventListener("click", this.boundHighlightTile );
    }
  }
  blackCaptureDivNeedsExpanding(board){
    let capturedPieces = board.capturedPieces,
      total = 0;
    for(let i = 0; i < capturedPieces.length; i++){
      if ( Board.parseTeam( capturedPieces[i] ) === Board.BLACK) { total++ }
    }
    if( total === 11 ){ this.expandBlackCaptureDiv() }
  }

  whiteCaptureDivNeedsExpanding(board){
    let capturedPieces = board.capturedPieces,
      total = 0;
    for(let i = 0; i < capturedPieces.length; i++){
      if ( Board.parseTeam( capturedPieces[i] ) === Board.WHITE) { total++ }
    }
    if( total === 11 ){ this.expandWhiteCaptureDiv() }
  }
  expandWhiteCaptureDiv(){
    let div = document.getElementById("W-captures")
    div.style.height = 98
  }
  expandBlackCaptureDiv(){
    let div = document.getElementById("B-captures")
    div.style.height = 98
  }
  setUndoClickListener(gameController){
    let undoButton = document.getElementById("undo-button");
    undoButton.addEventListener("click", gameController.undo.bind(gameController))
  }
  setPauseClickListener(gameController){
    let pauseButton = document.getElementById("pause-button");
    pauseButton.addEventListener("click", gameController.pause.bind(gameController))
  }
}

export default View