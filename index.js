/**
 * SillyTavern Card Games Extension
 * Play card games with your AI companions
 * 
 * @author Lei & Caleb
 * @version 0.2.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const MODULE_NAME = 'card_games';
const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[CardGames]', ...args);
}

function error(...args) {
  console.error('[CardGames]', ...args);
}

// Regex patterns for parsing hidden game data from AI responses
const PATTERNS = {
  gameState: /<game_state>([\s\S]*?)<\/game_state>/gi,
  aiHand: /<ai_hand>([\s\S]*?)<\/ai_hand>/i,
  aiSelected: /<ai_selected>([\s\S]*?)<\/ai_selected>/i,
  aiReasoning: /<ai_reasoning>([\s\S]*?)<\/ai_reasoning>/i,
};

// Game keyword detection
const GAME_KEYWORDS = {
  uno: ['uno', 'play uno', "let's play uno"],
  cah: ['cards against humanity', 'cah', 'play cah'],
};

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const defaultSettings = {
  enabled: true,
  currentGame: null,
  uiPosition: 'right',
  showAIThinking: false,
  autoStartOnKeyword: true,
};

// ============================================================================
// SIMPLE CARD DECK
// ============================================================================

class CardDeck {
  constructor(cards = []) {
    this.cards = [...cards];
    this.discardPile = [];
  }
  
  static createUnoDeck() {
    const colors = ['Red', 'Yellow', 'Green', 'Blue'];
    const cards = [];
    
    // Number cards (0-9)
    for (const color of colors) {
      cards.push({ color, value: '0', id: `${color}_0` });
      for (let i = 1; i <= 9; i++) {
        cards.push({ color, value: String(i), id: `${color}_${i}_a` });
        cards.push({ color, value: String(i), id: `${color}_${i}_b` });
      }
      // Action cards
      for (let i = 0; i < 2; i++) {
        cards.push({ color, value: 'Skip', type: 'action', id: `${color}_skip_${i}` });
        cards.push({ color, value: 'Reverse', type: 'action', id: `${color}_reverse_${i}` });
        cards.push({ color, value: '+2', type: 'action', id: `${color}_draw2_${i}` });
      }
    }
    // Wild cards
    for (let i = 0; i < 4; i++) {
      cards.push({ color: null, value: 'Wild', type: 'wild', id: `wild_${i}` });
      cards.push({ color: null, value: 'Wild +4', type: 'wild', id: `wild4_${i}` });
    }
    
    return new CardDeck(cards);
  }
  
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }
  
  draw(count = 1) {
    const drawn = [];
    for (let i = 0; i < count && this.cards.length > 0; i++) {
      drawn.push(this.cards.pop());
    }
    return drawn;
  }
  
  addToDiscard(card) {
    this.discardPile.push(card);
  }
  
  get topDiscard() {
    return this.discardPile[this.discardPile.length - 1] || null;
  }
  
  get remaining() {
    return this.cards.length;
  }
}

// ============================================================================
// GAME STATE
// ============================================================================

let gameState = {
  active: false,
  gameType: null,
  deck: null,
  playerHand: [],
  aiHand: [],
  currentTurn: 'player', // 'player' or 'ai'
  direction: 1,
  activeColor: null, // For wild cards
  turnCount: 0,
};

// ============================================================================
// GAME LOGIC
// ============================================================================

function startGame(type = 'uno') {
  log('Starting game:', type);
  
  gameState.active = true;
  gameState.gameType = type;
  gameState.deck = CardDeck.createUnoDeck().shuffle();
  gameState.playerHand = gameState.deck.draw(7);
  gameState.aiHand = gameState.deck.draw(7);
  gameState.currentTurn = 'player';
  gameState.direction = 1;
  gameState.turnCount = 0;
  
  // Draw first card for discard pile
  let firstCard = gameState.deck.draw(1)[0];
  while (firstCard.type === 'wild') {
    gameState.deck.cards.unshift(firstCard);
    gameState.deck.shuffle();
    firstCard = gameState.deck.draw(1)[0];
  }
  gameState.deck.addToDiscard(firstCard);
  gameState.activeColor = firstCard.color;
  
  renderGameUI();
  saveGameState();
  
  toastr.success(`Game started! You have ${gameState.playerHand.length} cards.`, 'Uno');
}

function endGame(reason = 'manual') {
  log('Ending game:', reason);
  gameState.active = false;
  hideGameUI();
  clearGameState();
  toastr.info('Game ended.', 'Card Games');
}

function isValidPlay(card, topCard, activeColor) {
  if (!card || !topCard) return false;
  if (card.type === 'wild') return true;
  if (card.color === (activeColor || topCard.color)) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function getValidPlays() {
  const topCard = gameState.deck.topDiscard;
  return gameState.playerHand.filter(card => 
    isValidPlay(card, topCard, gameState.activeColor)
  );
}

function playCard(card, chosenColor = null) {
  if (!gameState.active) return;
  
  const cardIndex = gameState.playerHand.findIndex(c => c.id === card.id);
  if (cardIndex === -1) {
    toastr.error('Card not in hand!');
    return;
  }
  
  const topCard = gameState.deck.topDiscard;
  if (!isValidPlay(card, topCard, gameState.activeColor)) {
    toastr.warning('Invalid play! Card must match color or value.');
    return;
  }
  
  // Remove from hand and add to discard
  gameState.playerHand.splice(cardIndex, 1);
  gameState.deck.addToDiscard(card);
  
  // Handle wild card color choice
  if (card.type === 'wild') {
    gameState.activeColor = chosenColor || 'Red';
    toastr.info(`Color changed to ${gameState.activeColor}`);
  } else {
    gameState.activeColor = card.color;
  }
  
  // Check for win
  if (gameState.playerHand.length === 0) {
    toastr.success('YOU WIN! 🎉', 'Uno');
    endGame('player_win');
    return;
  }
  
  // Handle special cards
  handleCardEffect(card);
  
  // Next turn
  gameState.currentTurn = 'ai';
  gameState.turnCount++;
  renderGameUI();
  saveGameState();
  
  log('Player played:', card);
}

function drawCard() {
  if (!gameState.active || gameState.currentTurn !== 'player') return;
  
  const drawn = gameState.deck.draw(1);
  if (drawn.length > 0) {
    gameState.playerHand.push(...drawn);
    toastr.info(`Drew: ${formatCard(drawn[0])}`);
    
    // End turn after drawing
    gameState.currentTurn = 'ai';
    renderGameUI();
    saveGameState();
  } else {
    toastr.warning('Deck is empty!');
  }
}

function handleCardEffect(card) {
  if (card.value === 'Skip') {
    // Skip AI turn - stays player's turn
    gameState.currentTurn = 'player';
    toastr.info('AI turn skipped!');
  } else if (card.value === 'Reverse') {
    gameState.direction *= -1;
    toastr.info('Direction reversed!');
  } else if (card.value === '+2' || card.value === 'Wild +4') {
    const drawCount = card.value === '+2' ? 2 : 4;
    const drawn = gameState.deck.draw(drawCount);
    gameState.aiHand.push(...drawn);
    toastr.info(`AI draws ${drawCount} cards!`);
  }
}

function formatCard(card) {
  if (!card) return '???';
  if (card.type === 'wild') return card.value;
  return `${card.color} ${card.value}`;
}

// ============================================================================
// AI RESPONSE PARSING
// ============================================================================

function parseAIResponse(messageContent) {
  const stateMatch = messageContent.match(PATTERNS.gameState);
  if (!stateMatch) return null;
  
  const stateBlock = stateMatch[0];
  const result = {};
  
  // Parse AI's selected card
  const selectedMatch = stateBlock.match(PATTERNS.aiSelected);
  if (selectedMatch) {
    result.selected = selectedMatch[1].trim();
  }
  
  // Parse AI reasoning (for debug mode)
  const reasoningMatch = stateBlock.match(PATTERNS.aiReasoning);
  if (reasoningMatch) {
    result.reasoning = reasoningMatch[1].trim();
  }
  
  return result;
}

function processAIMove(aiResponse) {
  if (!gameState.active || gameState.currentTurn !== 'ai') return;
  
  const parsed = parseAIResponse(aiResponse);
  if (!parsed || !parsed.selected) {
    log('No valid AI move found in response');
    return;
  }
  
  log('AI selected:', parsed.selected);
  
  // Find the card in AI's hand
  const selectedName = parsed.selected.toLowerCase();
  let playedCard = null;
  let cardIndex = -1;
  
  // Try to match the card
  for (let i = 0; i < gameState.aiHand.length; i++) {
    const card = gameState.aiHand[i];
    const cardName = formatCard(card).toLowerCase();
    if (cardName.includes(selectedName) || selectedName.includes(cardName)) {
      playedCard = card;
      cardIndex = i;
      break;
    }
  }
  
  // If "draw" was selected
  if (selectedName.includes('draw')) {
    const drawn = gameState.deck.draw(1);
    if (drawn.length > 0) {
      gameState.aiHand.push(...drawn);
      log('AI drew a card');
    }
    gameState.currentTurn = 'player';
    renderGameUI();
    saveGameState();
    return;
  }
  
  if (!playedCard || cardIndex === -1) {
    log('Could not find AI card:', parsed.selected);
    // AI draws instead
    const drawn = gameState.deck.draw(1);
    if (drawn.length > 0) {
      gameState.aiHand.push(...drawn);
    }
    gameState.currentTurn = 'player';
    renderGameUI();
    saveGameState();
    return;
  }
  
  // Validate and play
  const topCard = gameState.deck.topDiscard;
  if (!isValidPlay(playedCard, topCard, gameState.activeColor)) {
    log('AI attempted invalid play, drawing instead');
    const drawn = gameState.deck.draw(1);
    if (drawn.length > 0) {
      gameState.aiHand.push(...drawn);
    }
    gameState.currentTurn = 'player';
    renderGameUI();
    saveGameState();
    return;
  }
  
  // Play the card
  gameState.aiHand.splice(cardIndex, 1);
  gameState.deck.addToDiscard(playedCard);
  
  if (playedCard.type === 'wild') {
    // AI chooses a color (simple: pick most common in hand)
    const colorCounts = {};
    gameState.aiHand.forEach(c => {
      if (c.color) colorCounts[c.color] = (colorCounts[c.color] || 0) + 1;
    });
    const bestColor = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0];
    gameState.activeColor = bestColor ? bestColor[0] : 'Red';
  } else {
    gameState.activeColor = playedCard.color;
  }
  
  // Check for AI win
  if (gameState.aiHand.length === 0) {
    toastr.warning('AI WINS! Better luck next time!', 'Uno');
    endGame('ai_win');
    return;
  }
  
  // Handle effects (simplified - skip/reverse affect player)
  if (playedCard.value === '+2') {
    const drawn = gameState.deck.draw(2);
    gameState.playerHand.push(...drawn);
    toastr.warning('You draw 2 cards!');
  } else if (playedCard.value === 'Wild +4') {
    const drawn = gameState.deck.draw(4);
    gameState.playerHand.push(...drawn);
    toastr.warning('You draw 4 cards!');
  }
  
  gameState.currentTurn = 'player';
  gameState.turnCount++;
  renderGameUI();
  saveGameState();
  
  log('AI played:', playedCard);
}

// ============================================================================
// PROMPT INJECTION
// ============================================================================

function generateGamePrompt() {
  if (!gameState.active) return null;
  
  const topCard = gameState.deck.topDiscard;
  const aiHandStr = gameState.aiHand.map(formatCard).join(', ');
  const validPlays = gameState.aiHand
    .filter(c => isValidPlay(c, topCard, gameState.activeColor))
    .map(formatCard);
  
  return `[CARD GAME: UNO - Turn ${gameState.turnCount + 1}]

YOUR HAND (hidden from player): ${aiHandStr}

GAME STATE:
- Top card: ${formatCard(topCard)}
- Active color: ${gameState.activeColor || topCard?.color || 'None'}
- Your cards: ${gameState.aiHand.length}
- Player's cards: ${gameState.playerHand.length}
- Deck remaining: ${gameState.deck.remaining}

VALID PLAYS: ${validPlays.length > 0 ? validPlays.join(', ') : 'None - you must draw'}

INSTRUCTIONS:
Play a card by including your choice in hidden tags. Stay in character!

Example response:
*looks at cards thoughtfully*
<game_state>
<ai_selected>${validPlays[0] || 'draw'}</ai_selected>
<ai_reasoning>Your strategy here</ai_reasoning>
</game_state>
"I'll play this one~"

[END GAME CONTEXT]`;
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderGameUI() {
  if (!gameState.active) return;
  
  let panel = document.getElementById('card-game-panel');
  
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'card-game-panel';
    document.body.appendChild(panel);
  }
  
  const topCard = gameState.deck.topDiscard;
  const validPlays = getValidPlays();
  
  panel.innerHTML = `
    <div class="cg-header">
      <span class="cg-title">🎴 Uno</span>
      <div class="cg-controls">
        <button class="cg-btn" onclick="window.cardGameDrawCard()">Draw</button>
        <button class="cg-btn cg-close" onclick="window.cardGameEnd()">✕</button>
      </div>
    </div>
    <div class="cg-body">
      <div class="cg-info">
        <div class="cg-turn ${gameState.currentTurn === 'player' ? 'your-turn' : ''}">
          ${gameState.currentTurn === 'player' ? '👉 Your Turn' : '⏳ AI Turn'}
        </div>
        <div class="cg-stats">
          AI: ${gameState.aiHand.length} cards | Deck: ${gameState.deck.remaining}
        </div>
      </div>
      <div class="cg-discard">
        <div class="cg-label">Top Card</div>
        <div class="cg-card cg-card-${(topCard?.color || 'wild').toLowerCase()}">${formatCard(topCard)}</div>
        ${gameState.activeColor && topCard?.type === 'wild' ? `<div class="cg-active-color">Active: ${gameState.activeColor}</div>` : ''}
      </div>
      <div class="cg-hand">
        <div class="cg-label">Your Hand (${gameState.playerHand.length})</div>
        <div class="cg-cards">
          ${gameState.playerHand.map(card => {
            const isValid = validPlays.some(v => v.id === card.id);
            return `<div class="cg-card cg-card-${(card.color || 'wild').toLowerCase()} ${isValid ? 'cg-valid' : 'cg-invalid'}" 
                        onclick="window.cardGamePlayCard('${card.id}')"
                        title="${formatCard(card)}${isValid ? ' (playable)' : ''}">
              ${formatCard(card)}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
  
  panel.style.display = 'block';
}

function hideGameUI() {
  const panel = document.getElementById('card-game-panel');
  if (panel) {
    panel.style.display = 'none';
  }
}

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

function saveGameState() {
  const context = SillyTavern.getContext();
  if (context.chatMetadata) {
    context.chatMetadata.card_game = {
      active: gameState.active,
      gameType: gameState.gameType,
      playerHand: gameState.playerHand,
      aiHand: gameState.aiHand,
      discardPile: gameState.deck?.discardPile || [],
      deckCards: gameState.deck?.cards || [],
      currentTurn: gameState.currentTurn,
      direction: gameState.direction,
      activeColor: gameState.activeColor,
      turnCount: gameState.turnCount,
    };
    context.saveMetadata();
  }
}

function loadGameState() {
  const context = SillyTavern.getContext();
  const saved = context.chatMetadata?.card_game;
  
  if (saved && saved.active) {
    gameState.active = saved.active;
    gameState.gameType = saved.gameType;
    gameState.playerHand = saved.playerHand || [];
    gameState.aiHand = saved.aiHand || [];
    gameState.deck = new CardDeck(saved.deckCards || []);
    gameState.deck.discardPile = saved.discardPile || [];
    gameState.currentTurn = saved.currentTurn || 'player';
    gameState.direction = saved.direction || 1;
    gameState.activeColor = saved.activeColor;
    gameState.turnCount = saved.turnCount || 0;
    
    renderGameUI();
    log('Game state loaded');
  }
}

function clearGameState() {
  const context = SillyTavern.getContext();
  if (context.chatMetadata) {
    delete context.chatMetadata.card_game;
    context.saveMetadata();
  }
}

// ============================================================================
// GLOBAL FUNCTIONS (for UI onclick handlers)
// ============================================================================

window.cardGamePlayCard = function(cardId) {
  if (gameState.currentTurn !== 'player') {
    toastr.warning("Wait for your turn!");
    return;
  }
  
  const card = gameState.playerHand.find(c => c.id === cardId);
  if (!card) return;
  
  if (card.type === 'wild') {
    // Show color picker
    const color = prompt('Choose a color: Red, Yellow, Green, or Blue', 'Red');
    if (color && ['Red', 'Yellow', 'Green', 'Blue'].includes(color)) {
      playCard(card, color);
    }
  } else {
    playCard(card);
  }
};

window.cardGameDrawCard = function() {
  drawCard();
};

window.cardGameEnd = function() {
  endGame('manual');
};

// ============================================================================
// SETTINGS UI
// ============================================================================

function getSettings() {
  const context = SillyTavern.getContext();
  if (!context.extensionSettings[MODULE_NAME]) {
    context.extensionSettings[MODULE_NAME] = { ...defaultSettings };
  }
  return context.extensionSettings[MODULE_NAME];
}

function loadSettingsUI() {
  const settings = getSettings();
  
  $('#card_games_enabled').prop('checked', settings.enabled);
  $('#card_games_position').val(settings.uiPosition);
  $('#card_games_auto_detect').prop('checked', settings.autoStartOnKeyword);
  $('#card_games_show_reasoning').prop('checked', settings.showAIThinking);
}

function saveSettings() {
  const context = SillyTavern.getContext();
  context.saveSettingsDebounced();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleMessageReceived(data) {
  if (!gameState.active) return;
  
  // Try to process AI's game move
  if (gameState.currentTurn === 'ai' && data.message) {
    processAIMove(data.message);
  }
}

function handleMessageSent(data) {
  if (!getSettings().autoStartOnKeyword) return;
  
  const text = (data.message || '').toLowerCase();
  
  // Check for game start keywords
  for (const [gameType, keywords] of Object.entries(GAME_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      if (!gameState.active) {
        setTimeout(() => startGame(gameType), 500);
      }
      break;
    }
  }
}

function handleChatChanged() {
  // Hide UI first
  hideGameUI();
  
  // Reset state
  gameState.active = false;
  
  // Try to load saved game for this chat
  setTimeout(loadGameState, 100);
}

// ============================================================================
// PROMPT INTERCEPTOR
// ============================================================================

globalThis.cardGamePromptInterceptor = async function(chat, contextSize, abort, type) {
  if (!gameState.active || gameState.currentTurn !== 'ai') return;
  
  const prompt = generateGamePrompt();
  if (!prompt) return;
  
  // Add game context as a system message before the last message
  const gameContext = {
    is_user: false,
    is_system: true,
    mes: prompt,
    extra: { isCardGame: true },
  };
  
  chat.splice(Math.max(0, chat.length - 1), 0, gameContext);
  log('Injected game prompt');
};

// ============================================================================
// SLASH COMMANDS
// ============================================================================

function registerSlashCommands() {
  const context = SillyTavern.getContext();
  
  if (!context.SlashCommandParser) {
    log('SlashCommandParser not available');
    return;
  }
  
  context.SlashCommandParser.addCommandObject({
    name: 'cardgame',
    callback: handleSlashCommand,
    helpString: 'Card game controls: /cardgame start uno | end | status',
  });
  
  log('Slash commands registered');
}

async function handleSlashCommand(args, value) {
  const cmd = (value || '').toLowerCase().trim();
  const parts = cmd.split(' ');
  const action = parts[0];
  const param = parts[1];
  
  switch (action) {
    case 'start':
      startGame(param || 'uno');
      return 'Game started!';
    case 'end':
      endGame('command');
      return 'Game ended.';
    case 'status':
      if (gameState.active) {
        return `Playing ${gameState.gameType}. Your turn: ${gameState.currentTurn === 'player'}. Cards: ${gameState.playerHand.length}`;
      }
      return 'No game active.';
    default:
      return 'Usage: /cardgame start uno | end | status';
  }
}

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

jQuery(async () => {
  log('Initializing Card Games extension...');
  
  const context = SillyTavern.getContext();
  
  // Load settings HTML
  const settingsHtml = `
    <div id="card-games-settings" class="card-games-settings">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>🎴 Card Games</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div class="card-games-setting">
            <label>
              <input type="checkbox" id="card_games_enabled" />
              <span>Enable Card Games</span>
            </label>
          </div>
          <div class="card-games-setting">
            <label>
              <input type="checkbox" id="card_games_auto_detect" />
              <span>Auto-detect "let's play uno"</span>
            </label>
          </div>
          <div class="card-games-setting">
            <label>
              <input type="checkbox" id="card_games_show_reasoning" />
              <span>Show AI reasoning (debug)</span>
            </label>
          </div>
          <hr>
          <div class="card-games-buttons">
            <button class="menu_button" id="card_games_start_uno">▶️ Start Uno</button>
            <button class="menu_button" id="card_games_end">⏹️ End Game</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add settings to extensions panel
  $('#extensions_settings').append(settingsHtml);
  
  // Load saved settings
  loadSettingsUI();
  
  // Bind settings handlers
  $('#card_games_enabled').on('change', function() {
    getSettings().enabled = this.checked;
    saveSettings();
  });
  
  $('#card_games_auto_detect').on('change', function() {
    getSettings().autoStartOnKeyword = this.checked;
    saveSettings();
  });
  
  $('#card_games_show_reasoning').on('change', function() {
    getSettings().showAIThinking = this.checked;
    saveSettings();
  });
  
  $('#card_games_start_uno').on('click', () => startGame('uno'));
  $('#card_games_end').on('click', () => endGame('manual'));
  
  // Register event listeners
  const eventSource = context.eventSource;
  const eventTypes = context.event_types;
  
  eventSource.on(eventTypes.MESSAGE_RECEIVED, handleMessageReceived);
  eventSource.on(eventTypes.MESSAGE_SENT, handleMessageSent);
  eventSource.on(eventTypes.CHAT_CHANGED, handleChatChanged);
  
  // Register slash commands
  registerSlashCommands();
  
  // Load any saved game state
  loadGameState();
  
  log('Card Games extension initialized!');
});
