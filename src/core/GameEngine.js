/**
 * GameEngine - Core game loop and state management
 * Handles turn order, game phases, win conditions, and state serialization
 */

import { CardDeck } from './CardDeck.js';
import { Player } from './Player.js';

export class GameEngine {
  constructor(callbacks = {}) {
    this.callbacks = {
      onStateChange: callbacks.onStateChange || (() => {}),
      onTurnChange: callbacks.onTurnChange || (() => {}),
      onGameEnd: callbacks.onGameEnd || (() => {}),
    };
    
    this.reset();
  }
  
  /**
   * Reset engine to initial state
   */
  reset() {
    this.gameRules = null;
    this.deck = null;
    this.discardPile = [];
    this.players = [];
    this.currentPlayerIndex = 0;
    this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
    this.phase = 'idle'; // idle, setup, playing, resolution, ended
    this.turnNumber = 0;
    this.winner = null;
    this.lastAction = null;
    this.pendingEffects = [];
  }
  
  /**
   * Check if game is currently active
   */
  isActive() {
    return this.phase === 'playing' || this.phase === 'resolution';
  }
  
  /**
   * Start a new game
   */
  startGame(rules, options = {}) {
    this.reset();
    this.gameRules = rules;
    this.phase = 'setup';
    
    // Create deck
    this.deck = new CardDeck(rules.deck);
    this.deck.shuffle();
    
    // Create players
    this.players = options.players.map((p, index) => new Player({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      index: index,
    }));
    
    // Deal initial hands
    const handSize = rules.rules?.initialHand || 7;
    this.players.forEach(player => {
      player.hand = this.deck.draw(handSize);
    });
    
    // Set up initial discard pile (draw until valid starting card)
    let startCard;
    do {
      startCard = this.deck.draw(1)[0];
      if (this.isValidStartCard(startCard)) {
        this.discardPile.push(startCard);
      } else {
        // Put back and reshuffle
        this.deck.addToBottom([startCard]);
      }
    } while (this.discardPile.length === 0);
    
    // Determine first player (could be random or based on rules)
    this.currentPlayerIndex = options.startingPlayer ?? 0;
    
    // Start playing
    this.phase = 'playing';
    this.turnNumber = 1;
    
    this.notifyStateChange();
    this.callbacks.onTurnChange(this.getCurrentPlayer());
    
    return this.getState();
  }
  
  /**
   * Check if a card is valid to start the game
   */
  isValidStartCard(card) {
    // Most games don't allow special cards to start
    const invalidStartTypes = ['wild', 'action', 'special'];
    return !invalidStartTypes.includes(card.type);
  }
  
  /**
   * Get current player
   */
  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }
  
  /**
   * Check if it's the user's turn
   */
  isUserTurn() {
    const current = this.getCurrentPlayer();
    return current && !current.isAI;
  }
  
  /**
   * Get the top card of discard pile
   */
  getTopCard() {
    return this.discardPile[this.discardPile.length - 1] || null;
  }
  
  /**
   * Validate if a card can be played
   */
  validatePlay(card, playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return { valid: false, reason: 'Player not found' };
    }
    
    // Check if player has the card
    const hasCard = player.hand.some(c => c.id === card.id);
    if (!hasCard) {
      return { valid: false, reason: 'Card not in hand' };
    }
    
    // Check game-specific rules
    const topCard = this.getTopCard();
    const rules = this.gameRules.rules?.validPlay;
    
    if (rules) {
      // Evaluate conditions
      const isValid = this.evaluatePlayConditions(card, topCard, rules);
      if (!isValid) {
        return { valid: false, reason: 'Card cannot be played on current card' };
      }
    }
    
    return { valid: true };
  }
  
  /**
   * Evaluate play conditions from game rules
   */
  evaluatePlayConditions(card, topCard, rules) {
    if (!topCard) return true;
    
    // Check each condition type
    for (const condition of rules.conditions || []) {
      switch (condition) {
        case 'colorMatch':
          if (card.color && topCard.color && card.color === topCard.color) return true;
          break;
        case 'valueMatch':
          if (card.value === topCard.value) return true;
          break;
        case 'wildCard':
          if (card.type === 'wild') return true;
          break;
        case 'suitMatch':
          if (card.suit && topCard.suit && card.suit === topCard.suit) return true;
          break;
        case 'rankMatch':
          if (card.rank && topCard.rank && card.rank === topCard.rank) return true;
          break;
      }
    }
    
    return false;
  }
  
  /**
   * Process a user's move
   */
  processUserMove(move) {
    if (!this.isUserTurn()) return { success: false, reason: 'Not your turn' };
    
    return this.processMove(move, this.getCurrentPlayer());
  }
  
  /**
   * Process an AI's move (from parsed response)
   */
  processAIMove(move) {
    const aiPlayer = this.players.find(p => p.isAI);
    if (!aiPlayer) return { success: false, reason: 'No AI player' };
    if (this.getCurrentPlayer().id !== aiPlayer.id) {
      return { success: false, reason: 'Not AI turn' };
    }
    
    // Find the card AI selected
    let card = null;
    if (move.card) {
      card = this.findCardInHand(move.card, aiPlayer.id);
    }
    
    if (card) {
      return this.processMove({ type: 'play', card }, aiPlayer);
    } else if (move.action === 'draw') {
      return this.processMove({ type: 'draw' }, aiPlayer);
    }
    
    // If we can't parse AI's move, auto-draw
    console.warn('[GameEngine] Could not parse AI move, auto-drawing');
    return this.processMove({ type: 'draw' }, aiPlayer);
  }
  
  /**
   * Process any move
   */
  processMove(move, player) {
    this.lastAction = { player: player.id, move, turn: this.turnNumber };
    
    switch (move.type) {
      case 'play':
        return this.playCard(move.card, player);
      case 'draw':
        return this.drawCard(player);
      default:
        return { success: false, reason: 'Unknown move type' };
    }
  }
  
  /**
   * Play a card
   */
  playCard(card, player) {
    // Validate
    const validation = this.validatePlay(card, player.id);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }
    
    // Remove from hand
    const cardIndex = player.hand.findIndex(c => c.id === card.id);
    player.hand.splice(cardIndex, 1);
    
    // Add to discard
    this.discardPile.push(card);
    
    // Apply card effects
    this.applyCardEffects(card, player);
    
    // Check win condition
    if (this.checkWinCondition(player)) {
      this.endGame('win', player);
      return { success: true, gameEnded: true, winner: player.id };
    }
    
    // Next turn (unless effect changed it)
    if (!this.pendingEffects.includes('skipTurnChange')) {
      this.advanceTurn();
    }
    this.pendingEffects = [];
    
    this.notifyStateChange();
    return { success: true };
  }
  
  /**
   * Draw a card
   */
  drawCard(player, count = 1) {
    // Reshuffle if needed
    if (this.deck.remaining() < count) {
      this.reshuffleDiscard();
    }
    
    const drawn = this.deck.draw(count);
    player.hand.push(...drawn);
    
    // In some games, drawing ends your turn
    if (this.gameRules.rules?.drawEndsTurn !== false) {
      this.advanceTurn();
    }
    
    this.notifyStateChange();
    return { success: true, drawnCards: drawn };
  }
  
  /**
   * Reshuffle discard pile into deck
   */
  reshuffleDiscard() {
    if (this.discardPile.length <= 1) return;
    
    const topCard = this.discardPile.pop();
    this.deck.addToBottom(this.discardPile);
    this.deck.shuffle();
    this.discardPile = [topCard];
  }
  
  /**
   * Apply card effects based on game rules
   */
  applyCardEffects(card, player) {
    const effects = this.gameRules.rules?.cardEffects;
    if (!effects) return;
    
    const cardEffect = effects[card.value] || effects[card.type];
    if (!cardEffect) return;
    
    // Process each effect
    if (cardEffect.action) {
      this.executeEffect(cardEffect.action, cardEffect, player);
    }
    if (cardEffect.then) {
      this.executeEffect(cardEffect.then, cardEffect, player);
    }
  }
  
  /**
   * Execute a specific effect
   */
  executeEffect(action, params, player) {
    switch (action) {
      case 'skipNextPlayer':
        this.advanceTurn(); // Extra advance = skip
        this.pendingEffects.push('skipTurnChange');
        break;
        
      case 'reverseDirection':
        this.direction *= -1;
        // In 2-player, reverse acts like skip
        if (this.players.length === 2) {
          this.pendingEffects.push('skipTurnChange');
        }
        break;
        
      case 'nextPlayerDraws':
        const nextPlayer = this.getNextPlayer();
        this.drawCard(nextPlayer, params.amount || 2);
        break;
        
      case 'chooseColor':
        // For AI, color is determined by their choice
        // For user, UI should prompt
        this.pendingEffects.push('awaitColorChoice');
        break;
    }
  }
  
  /**
   * Get next player in turn order
   */
  getNextPlayer() {
    const nextIndex = (this.currentPlayerIndex + this.direction + this.players.length) % this.players.length;
    return this.players[nextIndex];
  }
  
  /**
   * Advance to next turn
   */
  advanceTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.length) % this.players.length;
    this.turnNumber++;
    
    this.callbacks.onTurnChange(this.getCurrentPlayer());
  }
  
  /**
   * Check win condition
   */
  checkWinCondition(player) {
    const condition = this.gameRules.rules?.winCondition;
    if (!condition) return false;
    
    // Simple evaluation
    if (condition === 'player.hand.length === 0') {
      return player.hand.length === 0;
    }
    
    // Could add more complex condition evaluation here
    return false;
  }
  
  /**
   * End the game
   */
  endGame(reason, winner = null) {
    this.phase = 'ended';
    this.winner = winner?.id || null;
    
    const result = {
      reason,
      winner: this.winner,
      turnCount: this.turnNumber,
      finalState: this.getState(),
    };
    
    this.callbacks.onGameEnd(result);
    return result;
  }
  
  /**
   * Process game-specific actions (Uno call, challenges, etc.)
   */
  processGameAction(action) {
    switch (action.type) {
      case 'uno':
        return this.handleUnoCall(action);
      case 'challenge':
        return this.handleChallenge(action);
      case 'chooseColor':
        return this.handleColorChoice(action);
      default:
        return { success: false, message: 'Unknown action' };
    }
  }
  
  handleUnoCall(action) {
    const player = this.players.find(p => p.id === action.playerId);
    if (!player) return { success: false, message: 'Player not found' };
    
    if (player.hand.length === 1) {
      player.calledUno = true;
      return { success: true, message: 'Uno!' };
    }
    return { success: false, message: 'Cannot call Uno with more than 1 card' };
  }
  
  handleChallenge(action) {
    // Implement challenge logic (e.g., for Wild Draw 4)
    return { success: false, message: 'Challenge not implemented' };
  }
  
  handleColorChoice(action) {
    // Set the active color for wild cards
    if (this.pendingEffects.includes('awaitColorChoice')) {
      this.activeColor = action.color;
      this.pendingEffects = this.pendingEffects.filter(e => e !== 'awaitColorChoice');
      return { success: true };
    }
    return { success: false, message: 'No pending color choice' };
  }
  
  /**
   * Find a card in a player's hand by description
   */
  findCardInHand(description, playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return null;
    
    const desc = description.toLowerCase().trim();
    
    return player.hand.find(card => {
      // Match by exact ID
      if (card.id.toLowerCase() === desc) return true;
      
      // Match by name
      if (card.name?.toLowerCase() === desc) return true;
      
      // Match by description (e.g., "red 7", "blue skip")
      const cardDesc = `${card.color || ''} ${card.value || ''}`.toLowerCase().trim();
      if (cardDesc === desc) return true;
      
      // Fuzzy match
      if (cardDesc.includes(desc) || desc.includes(cardDesc)) return true;
      
      return false;
    });
  }
  
  /**
   * Detect if user's message contains a play action
   */
  detectUserPlay(message) {
    // Simple detection - could be enhanced with NLP
    const playPatterns = [
      /plays?\s+(.+)/i,
      /i(?:'ll)?\s+play\s+(.+)/i,
      /puts?\s+down\s+(.+)/i,
    ];
    
    for (const pattern of playPatterns) {
      const match = message.match(pattern);
      if (match) {
        const cardDesc = match[1].trim();
        const card = this.findCardInHand(cardDesc, 'user');
        if (card) {
          return { type: 'play', card };
        }
      }
    }
    
    // Check for draw action
    if (/draws?\s+a?\s*card/i.test(message)) {
      return { type: 'draw' };
    }
    
    return null;
  }
  
  /**
   * Get current game state (for UI and serialization)
   */
  getState() {
    const userPlayer = this.players.find(p => !p.isAI);
    const aiPlayer = this.players.find(p => p.isAI);
    
    return {
      gameType: this.gameRules?.id,
      gameName: this.gameRules?.name,
      phase: this.phase,
      turnNumber: this.turnNumber,
      currentPlayer: this.getCurrentPlayer()?.id,
      direction: this.direction,
      
      // User's view
      userHand: userPlayer?.hand || [],
      userCardCount: userPlayer?.hand.length || 0,
      
      // AI state (hidden in game, shown in debug)
      aiCardCount: aiPlayer?.hand.length || 0,
      aiHand: aiPlayer?.hand || [], // Extension uses this, UI hides it
      
      // Board state
      topCard: this.getTopCard(),
      discardPileCount: this.discardPile.length,
      deckCount: this.deck?.remaining() || 0,
      
      // Active effects
      activeColor: this.activeColor,
      pendingEffects: this.pendingEffects,
      
      // Results
      winner: this.winner,
      lastAction: this.lastAction,
      
      // For AI prompts
      validPlays: this.getValidPlays('user'),
    };
  }
  
  /**
   * Get list of valid plays for a player
   */
  getValidPlays(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return [];
    
    return player.hand
      .filter(card => this.validatePlay(card, playerId).valid)
      .map(card => card.name || `${card.color} ${card.value}`);
  }
  
  /**
   * Serialize game state for storage
   */
  serialize() {
    return {
      gameType: this.gameRules?.id,
      rules: this.gameRules,
      deck: this.deck?.serialize(),
      discardPile: this.discardPile,
      players: this.players.map(p => p.serialize()),
      currentPlayerIndex: this.currentPlayerIndex,
      direction: this.direction,
      phase: this.phase,
      turnNumber: this.turnNumber,
      winner: this.winner,
      activeColor: this.activeColor,
      pendingEffects: this.pendingEffects,
    };
  }
  
  /**
   * Restore game from serialized state
   */
  async restore(data) {
    this.gameRules = data.rules;
    this.deck = new CardDeck(data.rules.deck);
    this.deck.restore(data.deck);
    this.discardPile = data.discardPile || [];
    this.players = data.players.map(p => Player.fromData(p));
    this.currentPlayerIndex = data.currentPlayerIndex;
    this.direction = data.direction;
    this.phase = data.phase;
    this.turnNumber = data.turnNumber;
    this.winner = data.winner;
    this.activeColor = data.activeColor;
    this.pendingEffects = data.pendingEffects || [];
  }
  
  /**
   * Notify state change
   */
  notifyStateChange() {
    this.callbacks.onStateChange(this.getState());
  }
}
