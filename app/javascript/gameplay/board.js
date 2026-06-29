import Layout from "gameplay/layout";
import Rules from "gameplay/rules";
import MoveApplier from "gameplay/move_applier";
import MatchHistory from "gameplay/match_history";

class Board {
  constructor({layOut: layOut, capturedPieces: capturedPieces, gameOver: gameOver, allowedToMove: allowedToMove, movementNotation: movementNotation, winner: winner, resultType: resultType, recentMoveContext: recentMoveContext, halfmoveClock: halfmoveClock, positionKeys: positionKeys}){
    this.layOut = layOut|| Layout.default()
    this.capturedPieces = capturedPieces || [];
    this.allowedToMove = allowedToMove || Board.WHITE;
    // EVERYTHING BELOW HERE IS SLATED FOR EXTRACTION
    this.gameOver = gameOver || false;
    this._winner = winner
    this._resultType = resultType || null
    this.history = new MatchHistory({
      movementNotation,
      recentMoveContext,
      halfmoveClock,
      positionKeys
    })
    this._castlingRightsCache = null
  }

  get movementNotation() {
    return this.history.movementNotation
  }

  set movementNotation(movementNotation) {
    this.history.movementNotation = movementNotation || []
  }

  get recentMoveContext() {
    return this.history.recentMoveContext
  }

  set recentMoveContext(recentMoveContext) {
    this.history.recentMoveContext = recentMoveContext || null
  }

  static get WHITE()  { return "W" }
  static get BLACK()  { return "B" }
  static get EMPTY()  { return "e" }

  static get PAWN()   { return "P" }
  static get ROOK()   { return "R" }
  // NIGHT INSTEAD OF KNIGHT FOR NOTATION
  static get NIGHT()  { return "N" }
  static get BISHOP() { return "B" }
  static get QUEEN()  { return "Q" }
  static get KING()   { return "K" }

  static get EMPTY_SQUARE() { return this.EMPTY + this.EMPTY }

  static get BLACK_PAWN() { return this.BLACK + this.PAWN }
  static get BLACK_ROOK() { return this.BLACK + this.ROOK }
  static get BLACK_NIGHT() { return this.BLACK + this.NIGHT }
  static get BLACK_BISHOP() { return this.BLACK + this.BISHOP }
  static get BLACK_KING() { return this.BLACK + this.KING }
  static get BLACK_QUEEN() { return this.BLACK + this.QUEEN }

  static get WHITE_PAWN() { return this.WHITE + this.PAWN }
  static get WHITE_ROOK() { return this.WHITE + this.ROOK }
  static get WHITE_NIGHT() { return this.WHITE + this.NIGHT }
  static get WHITE_BISHOP() { return this.WHITE + this.BISHOP }
  static get WHITE_KING() { return this.WHITE + this.KING }
  static get WHITE_QUEEN() { return this.WHITE + this.QUEEN }

  static get DARK()   { return "dark" }
  static get LIGHT()  { return "light" }
  static get MINOR_PIECES() { return [Board.NIGHT, Board.BISHOP] }
  static get MAJOR_PIECES() { return [Board.ROOK, Board.QUEEN]}

  static _boundaries(){
    return { upperLimit: 63, lowerLimit: 0 }
  }

  static _deepCopy(originalObject){
    let newObject = [];
    for( let i = 0; i < originalObject.length; i ++){
      newObject.push( originalObject[i] )
    }
    return newObject
  }

  clone() {
    let newLayout = Board._deepCopy(this.layOut),
      newCaptures = Board._deepCopy(this.capturedPieces),
    newBoard = new Board({
      layOut: newLayout,
      capturedPieces: newCaptures,
      allowedToMove: this.allowedToMove,
      gameOver: this.gameOver,
      winner: this._winner,
      resultType: this._resultType,
    });
    newBoard.history = this.history.clone()
  return newBoard;
  }

  lightClone() {
    let newLayout = Board._deepCopy(this.layOut),
        newCaptures = Board._deepCopy(this.capturedPieces),
        newBoard = new Board({
          layOut: newLayout,
          capturedPieces: newCaptures,
          allowedToMove: this.allowedToMove,
          gameOver: this.gameOver,
          winner: this._winner,
          resultType: this._resultType,
        });
    newBoard.history = this.history.lightClone()
    newBoard._castlingRightsCache = JSON.parse(JSON.stringify(this.castlingRightsCache()))
    return newBoard;
  }

  lightCloneForCheckQuery() {
    let newLayout = Board._deepCopy(this.layOut),
        newBoard = new Board({
          layOut: newLayout,
          allowedToMove: this.allowedToMove,
          gameOver: this.gameOver,
          winner: this._winner,
          resultType: this._resultType
        });
    newBoard.history = this.history.lightCloneForCheckQuery()
    newBoard._castlingRightsCache = this._castlingRightsCache
    return newBoard;
  }

  static isSeventhRank(position){
    position = Board.convertPositionFromAlphaNumeric(position)
    return Board.rankIndex(position) === 6
  }

  static isSecondRank(position){
    position = Board.convertPositionFromAlphaNumeric(position)
    return Board.rankIndex(position) === 1
  }

  static rankIndex(position){
    return Math.floor(position / 8)
  }

  static fileIndex(position){
    return position % 8
  }

  static rankLabel(position){
    return Board.rankIndex(position) + 1
  }

  static fileLabel(position){
    let files = "abcdefgh";
    return files[Board.fileIndex(position)]
  }

  static squareColor(position){
    position = Board.convertPositionFromAlphaNumeric(position)
    const sum = Board.rankIndex(position) + Board.fileIndex(position)
    return sum % 2 === 0 ? Board.DARK : Board.LIGHT
  }

  static opposingTeam(teamString){
    if( teamString === Board.WHITE ){
      return Board.BLACK
    } else {
      return Board.WHITE
    };
  }

  static gridCalculator(position){
    let x = Board.fileIndex(position),
        y = Board.rankIndex(position) + 1,
      alphaNum = {
        0: "a",
        1: "b",
        2: "c",
        3: "d",
        4: "e",
        5: "f",
        6: "g",
        7: "h"
      };
    return alphaNum[x] + y
  }

  static gridCalculatorReverse(alphaNumericPosition){
    let letter = alphaNumericPosition[0],
      number = alphaNumericPosition[1],
     alphaNum = {
        a: 0,
        b: 1,
        c: 2,
        d: 3,
        e: 4,
        f: 5,
        g: 6,
        h: 7
      },
      file = alphaNum[letter],
      rank = (number - 1) * 8
    return rank + file
  }

  static _inBounds(position){
    return position <= this._boundaries().upperLimit && position >= this._boundaries().lowerLimit
  }

  static parseTeam(string){
    return string[0]
  }

  static parseSpecies(string){
    return string[1]
  }

  _nextTurn(){
    if( this.allowedToMove === Board.WHITE ){
      this._prepareBlackTurn()
    } else{
      this._prepareWhiteTurn()
    }
  }

  _prepareBlackTurn(){
    this.allowedToMove = Board.BLACK
  }

  _prepareWhiteTurn(){
    this.allowedToMove = Board.WHITE
  }

  remainingPieceValueFor(team){
    let subtractedValue = 0,
        captures = this.capturedPieces;
    for( let i = 0; i < captures.length; i++){
      let piece = captures[i] ;
      if( Board.parseTeam( piece ) === team ){
        subtractedValue = subtractedValue + Board.pieceValues()[ Board.parseSpecies( piece ) ]
      }
    }
    // gonna be wrong after promotion
    return 39 - subtractedValue;
  }

  static pieceValues(){
    let values = {};
    values[Board.PAWN] = 1;
    values[Board.NIGHT] = 3;
    values[Board.BISHOP] = 3;
    values[Board.ROOK] = 5;
    values[Board.QUEEN] = 9;
    values[Board.KING] = 0;
    return values;
  }

  static convertPositionFromAlphaNumeric(position){
    if( typeof( position ) === 'string' && position.match(/[a-z]\d/) && position.length === 2){
      return Board.gridCalculatorReverse( position )
    } else {
      // IS THIS A FAIL SAFE OR DOES THIS HAPPEN?
      return position
    }
  }

  _blackPawnAt(position){
    return  this._blackPieceCheck(position) && this._pawnCheck(position)
  }

  _whitePawnAt(position){
    return this._whitePieceCheck(position) && this._pawnCheck(position)
  }

  _blackPieceCheck(position){
    return Board.parseTeam( this.pieceObject(position) ) === Board.BLACK
  }

  _whitePieceCheck(position){
    return Board.parseTeam( this.pieceObject(position) ) === Board.WHITE
  }

  _pawnCheck(position){
    return Board.parseSpecies( this.pieceObject(position) ) === Board.PAWN
  }

  deepCopy(){
    return this.clone()
  }

  teamNotMoving(){
    let teamNotMoving;
    if( this.allowedToMove === Board.WHITE){
      teamNotMoving = Board.BLACK
    } else {
      teamNotMoving = Board.WHITE
    }
    return teamNotMoving
  }

  _capture(position){
    let pieceObject = this.layOut[position];
    this.capturedPieces.push(pieceObject);
  }

  _oneSpaceDownIsEmpty(position){
    if (position < 8) { return false }
    return this.positionEmpty(position - 8)
  }

  _twoSpacesDownIsEmpty(position){
    if (position < 16) { return false }
    return this.positionEmpty(position - 16)
  }

  _squareColorsMatch(square1, square2){
    return Board.squareColor(square1) === Board.squareColor(square2)
  }

  _twoSpacesUpIsEmpty(position){
    if (position > 47) { return false }
    return this.positionEmpty( position + 16)
  }

  _oneSpaceUpIsEmpty(position){
    if (position > 55) { return false }
    return this.positionEmpty( position + 8)
  }

  pieceObject(position){
    position = Board.convertPositionFromAlphaNumeric(position)
    return this.layOut[position]
  }

  _emptify(position){
    this.layOut[position] = Board.EMPTY + Board.EMPTY
  }

  _placePiece({position: position, pieceObject: pieceObject}){
    this.layOut[position] = pieceObject
  }

  teamAt(position){
    position = Board.convertPositionFromAlphaNumeric(position)
    if( !Board._inBounds(position) ){
      return Board.EMPTY
    };
    let pieceObject = this.pieceObject(position),
      teamString = Board.parseTeam( pieceObject );
    return teamString
  }

  positionsOccupiedByTeam(teamString){
    let positions = this._positionsOccupiedByTeam(teamString),
    alphaNumericPositions = [];
    for (let i = 0; i < positions.length; i++){
      alphaNumericPositions.push( Board.gridCalculator( positions[i] ))
    }
    return alphaNumericPositions;
  }

  _positionsOccupiedByOpponentOf(teamString){
    let opposingTeam = Board.opposingTeam(teamString);
    return this._positionsOccupiedByTeam(opposingTeam)
  }

  _positionsOccupiedByTeam(teamString){
    let positions = [];
    for( let i = 0; i < this.layOut.length && positions.length < 16; i++){
      let teamAt = this.teamAt(i);
      if(teamAt === teamString){
        positions.push(i)
      };
    };
    return positions
  }

  occupiedByTeamMate({position: position, teamString: teamString}){
    position = Board.convertPositionFromAlphaNumeric(position)
    let occupantTeam = this.teamAt(position);
    return teamString === occupantTeam
  }

  occupiedByOpponent({position: position, teamString: teamString}){
    position = Board.convertPositionFromAlphaNumeric(position)
    let occupantTeam = this.teamAt(position);
    return !this.positionEmpty(position) && teamString !== occupantTeam
  }

  positionEmpty(position){
    position = Board.convertPositionFromAlphaNumeric(position)
    let pieceObject = this.pieceObject(position)
    return Board.parseTeam( pieceObject ) === Board.EMPTY
  }

  pieceTypeAt(position){
    position = Board.convertPositionFromAlphaNumeric(position)
    let pieceObject = this.pieceObject(position),
      pieceType = Board.parseSpecies( pieceObject );
    return pieceType
  }

  kingPosition(teamString){
    let position = this._kingPosition(teamString);
    return Board.gridCalculator(position);
  }

  _kingPosition(teamString){
    let layOut = this.layOut,
      position = null;
    for(let i = 0; i < layOut.length; i ++){
      let teamAtPosition = this.teamAt(i),
        pieceType = this.pieceTypeAt(i);
      if(teamAtPosition === teamString && pieceType === Board.KING){
        position = i
        break
      }
    }
    return position
  }

  // FUTURE EXTRACTION MOVE HISTORY AND MATCH STATE TRACKING 
  // will also pull state: _winner, movementNotation, _resultType, gameOver

  movesNotationFor(team){
    let teamMoves = [];
    if( team === Board.WHITE ){
      var initialElement = 0
    } else if (team === Board.BLACK ){
      var initialElement = 1
    } else {
      alert( "bad input for board.movesNotationFor: " + team )
    }
    for(let i = initialElement; i < this.movementNotation.length; i = i + 2 ){
      teamMoves.push( this.movementNotation[i] )
    }
    return teamMoves;
  }

  _endGame({ winner: winner = null, resultType: resultType = null } = {}){
    this.gameOver = true
    this._winner = winner
    this._resultType = resultType
  }

  _recordNotation({ baseNotation: baseNotation, epNotation: epNotation, notationSuffix: notationSuffix }){
    const notation = baseNotation + (epNotation || "") + notationSuffix
    const moveNumber = Math.floor(this.movementNotation.length / 2) + 1
    const prefixedNotation = this.allowedToMove === Board.WHITE ? `${moveNumber}. ${notation}` : notation
    this._castlingRightsCache = null
    this.movementNotation.push(prefixedNotation)
  }

  _reset(){
    this.layOut = Layout.default();
    this.capturedPieces = [];
    this.gameOver = false;
    this.allowedToMove = Board.WHITE;
    this.movementNotation = [];
    this.recentMoveContext = null;
    this.history.positionKeys = [];
    this.history.halfmoveClock = 0;
    this._castlingRightsCache = null
  }

  // FUTURE EXTRACTION STATE TRANSITIONS

  _hypotheticallyMovePiece( moveObject ){ // ONLY USE THIS TO SEE IF A MOVE WOULD RESULT IN MATE. there's a lot of space between _officiallyMovePiece and hypothetical. eg  not recording any data on hypothetical moves
    let startPosition = moveObject.startPosition,
      endPosition = moveObject.endPosition,
      additionalActions = moveObject.additionalActions,
      promotionPiece = moveObject.promotionPiece;
      let pieceObject = this.pieceObject(startPosition);
    this._emptify(startPosition)
    this._placePiece({ position: endPosition, pieceObject: pieceObject })
    if( additionalActions ){ additionalActions.call(this, startPosition) }
    if( promotionPiece ){
      this._placePiece({ position: endPosition, pieceObject: this.allowedToMove + promotionPiece })
    }
  }

  _officiallyMovePiece( moveObject ){
    // if( !MoveObject.prototype.isPrototypeOf( moveObject ) ){ throw new Error("missing params in movePiece") }
    return new MoveApplier({ board: this, moveObject }).apply()
  }

  baseNotationFor(moveObject){
    if( /O-O/.exec(moveObject.pieceNotation) ){
      return moveObject.pieceNotation
    }

    return this.disambiguatedPieceNotation(moveObject) +
      (moveObject.captureNotation || "") +
      Board.gridCalculator(moveObject.endPosition) +
      (moveObject.promotionPiece ? `=${moveObject.promotionPiece}` : "")
  }

  disambiguatedPieceNotation(moveObject){
    let pieceNotation = moveObject.pieceNotation
    if( !/[QNBR]/.exec(pieceNotation) ){ return pieceNotation }

    let competingStarts = this.competingMoveStarts(moveObject)
    if( competingStarts.length === 0 ){ return pieceNotation }

    let startFile = Board.fileLabel(moveObject.startPosition),
      startRank = Board.rankLabel(moveObject.startPosition),
      fileMatches = competingStarts.filter(position => Board.fileLabel(position) === startFile)
    if( fileMatches.length === 0 ){ return pieceNotation + startFile }

    let rankMatches = competingStarts.filter(position => Board.rankLabel(position) === startRank)
    if( rankMatches.length === 0 ){ return pieceNotation + startRank }

    return pieceNotation + Board.gridCalculator(moveObject.startPosition)
  }

  competingMoveStarts(moveObject){
    let movingPiece = this.pieceObject(moveObject.startPosition),
      movingTeam = Board.parseTeam(movingPiece),
      movingSpecies = Board.parseSpecies(movingPiece),
      endPosition = moveObject.endPosition,
      occupiedPositions = this._positionsOccupiedByTeam(movingTeam)

    return occupiedPositions.filter(position => {
      if( position === moveObject.startPosition ){ return false }
      if( this.pieceTypeAt(position) !== movingSpecies ){ return false }

      return Rules.availableMovesFrom({ board: this, startPosition: position }).some(
        candidateMove => candidateMove.endPosition === endPosition
      )
    })
  }

  // DUBIOUS OWNERNSHIP, probably part of the match history?
  blackPawnRecentlyDoubleSteppedTo(position){
    const recentMove = this.recentMoveContext
    if (!recentMove) { return null }

    return (
      recentMove.movingTeam === Board.BLACK &&
      recentMove.movedPieceSpeciesBeforeMove === Board.PAWN &&
      recentMove.movedPieceStartPosition === position + 16 &&
      recentMove.movedPieceEndPosition === position
    )
  }

  blackPawnDoubleSteppedToFromNotation(position){
    var result = true;
    let blackMoves = this.movesNotationFor(Board.BLACK),
      square = Board.gridCalculator(position),
      singleStepSquare = square[0] + '6',
      doubleStepSquare = square[0] + '5';
    if( blackMoves[blackMoves.length -1] != doubleStepSquare ){
      return false
    }
    for(let i = 0; i < blackMoves.length; i++){
      if( blackMoves[i] === singleStepSquare || blackMoves[i] === singleStepSquare + "+" ){
        result = false;
        break
      }
    }
    return result
  }

  blackPawnDoubleSteppedTo(position){
    const recentMoveResult = this.blackPawnRecentlyDoubleSteppedTo(position)
    if (recentMoveResult !== null) { return recentMoveResult }

    return this.blackPawnDoubleSteppedToFromNotation(position)
  }

  whitePawnRecentlyDoubleSteppedTo(position){
    const recentMove = this.recentMoveContext
    if (!recentMove) { return null }

    return (
      recentMove.movingTeam === Board.WHITE &&
      recentMove.movedPieceSpeciesBeforeMove === Board.PAWN &&
      recentMove.movedPieceStartPosition === position - 16 &&
      recentMove.movedPieceEndPosition === position
    )
  }

  whitePawnDoubleSteppedToFromNotation(position){
    var result = true;
    let whiteMoves = this.movesNotationFor(Board.WHITE),
      square = Board.gridCalculator(position),
      singleStepSquare = square[0] + '3',
      doubleStepSquare = square[0] + '4';
    if( whiteMoves[whiteMoves.length -1] != doubleStepSquare ){
      return false
    }
    for(let i = 0; i < whiteMoves.length; i++){
      if( whiteMoves[i] === singleStepSquare || whiteMoves[i] === singleStepSquare + "+" ){
        result = false;
        break
      }
    }
    return result
  }

  whitePawnDoubleSteppedTo(position){
    const recentMoveResult = this.whitePawnRecentlyDoubleSteppedTo(position)
    if (recentMoveResult !== null) { return recentMoveResult }

    return this.whitePawnDoubleSteppedToFromNotation(position)
  }

  castlingRightsCache() {
    if (this._castlingRightsCache) {
      return this._castlingRightsCache
    }
    const rights = {
      [Board.WHITE]: { kingMoved: false, kingSideRookMoved: false, queenSideRookMoved: false },
      [Board.BLACK]: { kingMoved: false, kingSideRookMoved: false, queenSideRookMoved: false }
    }
    for (let i = 0; i < this.movementNotation.length; i++) {
      const notation = this.movementNotation[i]
      const team = i % 2 === 0 ? Board.WHITE : Board.BLACK
      if (/^(\d+\.\s+)?K/.test(notation) || /^(\d+\.\s+)?O-O/.test(notation) || /^(\d+\.\s+)?O-O-O/.test(notation)) {
        rights[team].kingMoved = true
      }
      if (/^(\d+\.\s+)?R(h|g|f)/.test(notation)) {
        rights[team].kingSideRookMoved = true
      }
      if (/^(\d+\.\s+)?R(a|b|c|d)/.test(notation)) {
        rights[team].queenSideRookMoved = true
      }
    }
    this._castlingRightsCache = rights
    return rights
  }

  castleSquaresAreEmpty(squares){
    for (let i = 0; i < squares.length; i++) {
      if (!this.positionEmpty(squares[i])) { return false }
    }
    return true
  }

  castlePathIsSafe(startPosition, pathSquares){
    const king = this.pieceObject(startPosition)

    for (let i = 0; i < pathSquares.length; i++) {
      const square = pathSquares[i]
      const testBoard = this.deepCopy()

      testBoard._emptify(startPosition)
      testBoard._placePiece({ position: square, pieceObject: king })

      if (Rules.pieceIsAttacked({ board: testBoard, defensePosition: square, defendingTeam: Board.parseTeam(king) })) {
        return false
      }
    }

    return true
  }
  
  kingSideCastleViableFor(team, startPosition){
    if( this.pieceObject(startPosition + 3) !== team + Board.ROOK ){ return false }
    if (Rules.checkQuery({board: this, teamString: team}) ){ return false }
    // thinks you can castle if rook was captured but never moved!
    const rights = this.castlingRightsCache()[team]
    if (rights.kingMoved || rights.kingSideRookMoved) { return false }
    if (team === Board.WHITE) {
      if (startPosition !== 4) { return false }
      var necessaryEmptyPositions = [5, 6]
    } else if (team === Board.BLACK) {
      if (startPosition !== 60) { return false }
      var necessaryEmptyPositions = [61, 62]
    } else {
      alert('bad input for board.kingSideCastleViableFor :' + team)
    }

    if (!this.castleSquaresAreEmpty(necessaryEmptyPositions)) { return false }
    if (!this.castlePathIsSafe(startPosition, [startPosition + 1, startPosition + 2])) {
      return false
    }
    return true;
  }

  queenSideCastleViableFor(team, startPosition){
    if( this.pieceObject(startPosition - 4) !== team + Board.ROOK ){ return false }
    if (Rules.checkQuery({board: this, teamString: team}) ){ return false }
    // thinks you can castle if rook was captured but never moved!
    const rights = this.castlingRightsCache()[team]
    if (rights.kingMoved || rights.queenSideRookMoved) { return false }
    if (team === Board.WHITE) {
      if (startPosition !== 4) { return false }
      var necessaryEmptyPositions = [1, 2, 3]
    } else if (team === Board.BLACK) {
      if (startPosition !== 60) { return false }
      var necessaryEmptyPositions = [59, 58, 57]
    } else {
      alert('bad input for board.kingSideCastleViableFor :' + team)
    }
    if (!this.castleSquaresAreEmpty(necessaryEmptyPositions)) { return false }
    if (!this.castlePathIsSafe(startPosition, [startPosition - 1, startPosition - 2])) {
      return false
    }
    return true;
  }

  // _kingSideCastleIsClear(kingPosition){
  //   return this.positionEmpty(kingPosition + 1) && this.positionEmpty(kingPosition + 2 )
  // }

  // _queenSideCastleIsClear(kingPosition){
  //   return this.positionEmpty(kingPosition - 1 ) && this.positionEmpty(kingPosition - 2 ) && this.positionEmpty(kingPosition - 3 )
  // }

  // _kingSideRookHasNotMoved(kingPosition){
  //   let kingSideRookStartPosition = kingPosition + 3;
  //   return (this.pieceTypeAt( kingSideRookStartPosition ) ===Board.ROOK) && this.pieceHasNotMovedFrom( kingSideRookStartPosition )
  // }

  // _queenSideRookHasNotMoved(kingPosition){
  //   let queenSideRookStartPosition = kingPosition - 4;

  //   return (this.pieceTypeAt( queenSideRookStartPosition ) ===Board.ROOK) && this.pieceHasNotMovedFrom( queenSideRookStartPosition )
  // }

  // FUTURE EXTRACTION SOUND AND VIEW HELPERS

  getAlertsAndSounds(){
    let lastNotation = this.movementNotation[this.movementNotation.length -1] || "",
      alert = "",
      sound = "move";
    if( /#/.exec(lastNotation) ){
      alert = "checkmate"
      sound = "check"
    } else if( /\+/.exec(lastNotation) ) {
      alert = "check"
      sound = "check"
    } else if( this._resultType === "fifty_move_rule" ) {
      alert = "50-move rule"
      sound = "move"
    } else if( this._resultType === "threefold_repetition" ) {
      alert = "threefold repetition"
      sound = "move"
    } else if( this.gameOver === true ){
      alert = "stalemate"
      sound = "move"
    } else if( /x/.exec(lastNotation) ){
      sound = "capture"
    } else {
      sound = "move"
    }
    return {alert: alert, sound: sound}
  }

  consoleLogBlackPov(){
    for( let i = 0; i < 64; i = i + 8 ){
      let row = ""
      for( let j = 0; j < 8; j++){
        let pieceObject = this.pieceObject(i + j)
        if( Board.parseTeam(pieceObject) === Board.EMPTY ){
          var text = "  __  "
        } else {
          var text = "  " + Board.parseTeam(pieceObject)[0] + Board.parseSpecies( pieceObject )[0] + "  "
        }
        row = row + text
      }
      console.log(row)
      console.log(" ")
    }
  }

  consoleLogWhitePov(){
    for( let i = 56; i > -1; i = i - 8 ){
      let row = ""
      for( let j = 0; j < 8; j++){
        let pieceObject = this.pieceObject(i + j)
        if( Board.parseTeam(pieceObject) === Board.EMPTY ){
          var text = "  __  "
        } else {
          var text = "  " + Board.parseTeam(pieceObject)[0] + Board.parseSpecies( pieceObject )[0] + "  "
        }
        row = row + text
      }
      console.log(row)
      console.log(" ")
    }
  }


}

export default Board
