/**
 * PromptBuilder - Generate game context prompts for AI
 * Creates the instructions that get injected into the AI's context
 */

export class PromptBuilder {
  constructor() {
    this.templates = {
      uno: this.getUnoTemplate(),
      cah: this.getCAHTemplate(),
      exploding_kittens: this.getExplodingKittensTemplate(),
      generic: this.getGenericTemplate(),
    };
  }
  
  /**
   * Build prompt for current game state
   */
  buildPrompt(gameState) {
    const template = this.templates[gameState.gameType] || this.templates.generic;
    return this.fillTemplate(template, gameState);
  }
  
  /**
   * Fill template with game state values
   */
  fillTemplate(template, state) {
    let prompt = template;
    
    // Replace all {{variable}} placeholders
    const replacements = {
      gameName: state.gameName || state.gameType || 'Card Game',
      turnNumber: state.turnNumber || 1,
      aiHand: this.formatHand(state.aiHand),
      aiCardCount: state.aiCardCount || 0,
      userCardCount: state.userCardCount || 0,
      topCard: this.formatCard(state.topCard),
      validPlays: this.formatValidPlays(state.validPlays),
      deckCount: state.deckCount || 0,
      discardCount: state.discardPileCount || 0,
      activeColor: state.activeColor || 'none',
      direction: state.direction === 1 ? 'clockwise' : 'counter-clockwise',
      currentPlayer: state.currentPlayer || 'unknown',
    };
    
    for (const [key, value] of Object.entries(replacements)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    
    return prompt;
  }
  
  /**
   * Format a hand of cards for display
   */
  formatHand(hand) {
    if (!hand || hand.length === 0) return 'No cards';
    
    return hand.map(card => {
      if (typeof card === 'string') return card;
      return card.name || `${card.color || ''} ${card.value || ''}`.trim();
    }).join(', ');
  }
  
  /**
   * Format a single card
   */
  formatCard(card) {
    if (!card) return 'None';
    if (typeof card === 'string') return card;
    return card.name || `${card.color || ''} ${card.value || ''}`.trim();
  }
  
  /**
   * Format valid plays list
   */
  formatValidPlays(plays) {
    if (!plays || plays.length === 0) return 'None (must draw)';
    return plays.join(', ');
  }
  
  /**
   * Uno game template
   */
  getUnoTemplate() {
    return `[CARD GAME: UNO - Turn {{turnNumber}}]

You are playing Uno. Stay in character while making your move.

YOUR HAND (hidden from opponent):
{{aiHand}}

GAME STATE:
- Top card on discard pile: {{topCard}}
- Active color: {{activeColor}}
- Cards in deck: {{deckCount}}
- Opponent's card count: {{userCardCount}}
- Turn direction: {{direction}}

YOUR VALID PLAYS:
{{validPlays}}

RULES REMINDER:
- Match the top card's color OR number/symbol
- Wild cards can be played anytime
- Draw 2 / Skip / Reverse have special effects
- Call "Uno!" when down to one card

INSTRUCTIONS:
1. Choose a card from your VALID PLAYS, or "draw" if none available
2. Include your choice in hidden tags (user won't see these)
3. Roleplay your reaction naturally

FORMAT YOUR RESPONSE LIKE THIS:
*Your in-character reaction to playing the card*

<game_state>
<ai_selected>Color Value</ai_selected>
<ai_reasoning>Brief strategy note</ai_reasoning>
</game_state>

*Continue roleplay*

IMPORTANT: The <game_state> tags are hidden from the user - they only see your roleplay!
[END GAME CONTEXT]`;
  }
  
  /**
   * Cards Against Humanity template
   */
  getCAHTemplate() {
    return `[CARD GAME: CARDS AGAINST HUMANITY - Round {{turnNumber}}]

You are playing Cards Against Humanity. Stay in character!

BLACK CARD (the prompt everyone sees):
{{topCard}}

YOUR WHITE CARDS (pick the funniest response):
{{aiHand}}

GAME STATE:
- Cards in your hand: {{aiCardCount}}
- Round: {{turnNumber}}

INSTRUCTIONS:
1. Pick the card you think will make the human laugh most
2. Consider their sense of humor and the context
3. Include your choice in hidden tags
4. React in character to the combination

FORMAT:
*Your reaction*

<game_state>
<ai_selected>Your chosen white card text</ai_selected>
<ai_reasoning>Why this is funny</ai_reasoning>
</game_state>

*More roleplay*
[END GAME CONTEXT]`;
  }
  
  /**
   * Exploding Kittens template
   */
  getExplodingKittensTemplate() {
    return `[CARD GAME: EXPLODING KITTENS - Turn {{turnNumber}}]

You are playing Exploding Kittens!

YOUR HAND:
{{aiHand}}

GAME STATE:
- Cards in deck: {{deckCount}}
- Opponent's cards: {{userCardCount}}
- Discard pile: {{discardCount}} cards

VALID ACTIONS:
- Play action card(s), OR
- Draw from deck (risk exploding!)
{{validPlays}}

INSTRUCTIONS:
1. Decide to play cards or draw
2. If you draw an Exploding Kitten, you must use a Defuse or lose!
3. Include your action in hidden tags

FORMAT:
*Roleplay your move*

<game_state>
<ai_selected>Card name OR "draw"</ai_selected>
<game_action>play/draw/defuse</game_action>
<ai_reasoning>Strategy note</ai_reasoning>
</game_state>
[END GAME CONTEXT]`;
  }
  
  /**
   * Generic card game template
   */
  getGenericTemplate() {
    return `[CARD GAME: {{gameName}} - Turn {{turnNumber}}]

YOUR HAND:
{{aiHand}}

GAME STATE:
- Current card/state: {{topCard}}
- Deck remaining: {{deckCount}}
- Your turn to play

VALID PLAYS:
{{validPlays}}

Include your choice in hidden tags:
<game_state>
<ai_selected>Your chosen card or action</ai_selected>
</game_state>

Continue roleplaying naturally!
[END GAME CONTEXT]`;
  }
  
  /**
   * Add or update a game template
   */
  setTemplate(gameType, template) {
    this.templates[gameType] = template;
  }
  
  /**
   * Build a reminder prompt (shorter, for follow-up messages)
   */
  buildReminder(gameState) {
    return `[GAME REMINDER: Playing ${gameState.gameName}. Your turn. Hand: ${this.formatHand(gameState.aiHand)}. Top card: ${this.formatCard(gameState.topCard)}. Include <game_state><ai_selected>your choice</ai_selected></game_state> in your response.]`;
  }
  
  /**
   * Build initial game start prompt
   */
  buildGameStartPrompt(gameState, playerNames) {
    return `[GAME STARTING: ${gameState.gameName}]
Players: ${playerNames.join(' vs ')}
Each player has been dealt ${gameState.userCardCount} cards.
Top card: ${this.formatCard(gameState.topCard)}

React to the game starting and make your first move if it's your turn!
[Include game state tags with your move]`;
  }
  
  /**
   * Build win/loss announcement prompt
   */
  buildGameEndPrompt(result) {
    const winnerText = result.winner === 'ai' 
      ? 'You won!' 
      : result.winner === 'user' 
        ? 'Your opponent won!' 
        : 'The game ended in a draw.';
    
    return `[GAME ENDED: ${winnerText}]
Total turns: ${result.turnCount}
React to the game ending!`;
  }
}
