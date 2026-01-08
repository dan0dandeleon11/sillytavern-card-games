/**
 * SillyTavern Card Games Extension
 * Play card games with your AI companions
 * 
 * @author Dan & Caleb
 * @version 0.3.0
 */

const MODULE_NAME = 'card_games';
const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[CardGames]', ...args);
}

// Regex patterns
const PATTERNS = {
  gameState: /<game_state>([\s\S]*?)<\/game_state>/i,
  aiSelected: /<ai_selected>([\s\S]*?)<\/ai_selected>/i,
};

const GAME_KEYWORDS = {
  uno: ['uno', 'play uno', "let's play uno"],
};

const defaultSettings = {
  enabled: true,
  autoStartOnKeyword: true,
};

// ============================================================================
// CARD DECK
// ============================================================================

class CardDeck {
  constructor(cards = []) {
    this.cards = [...cards];
    this.discardPile = [];
  }
  
  static createUnoDeck() {
    const colors = ['Red', 'Yellow', 'Green', 'Blue'];
    const cards = [];
    
    for (const color of colors) {
      cards.push({ color, value: '0', id: `${color}_0` });
      for (let i = 1; i <= 9; i++) {
        cards.push({ color, value: String(i), id: `${color}_${i}_a` });
        cards.push({ color, value: String(i), id: `${color}_${i}_b` });
      }
      for (let i = 0; i < 2; i++) {
        cards.push({ color, value: 'Skip', type: 'action', id: `${color}_skip_${i}` });
        cards.push({ color, value: 'Reverse', type: 'action', id: `${color}_reverse_${i}` });
        cards.push({ color, value: '+2', type: 'action', id: `${color}_draw2_${i}` });
      }
    }
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
  currentTurn: 'player',
  direction: 1,
  activeColor: null,
  turnCount: 0,
  minimized: false,
  playerNeedsUno: false, // Player needs to call Uno
  playerCalledUno: false, // Player called Uno this round
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
  
  gameState.playerHand.splice(cardIndex, 1);
  gameState.deck.addToDiscard(card);
  
  if (card.type === 'wild') {
    gameState.activeColor = chosenColor || 'Red';
    toastr.info(`Color changed to ${gameState.activeColor}`);
  } else {
    gameState.activeColor = card.color;
  }
  
  // Check for Uno call (1 card left)
  if (gameState.playerHand.length === 1) {
    gameState.playerNeedsUno = true;
    gameState.playerCalledUno = false;
    toastr.warning('You have ONE card! Click "UNO!" button!', 'Uno!');
  } else {
    // Reset uno state if player has more than 1 card
    gameState.playerNeedsUno = false;
    gameState.playerCalledUno = false;
  }
  
  // Check for win
  if (gameState.playerHand.length === 0) {
    toastr.success('YOU WIN! 🎉', 'Uno');
    endGame('player_win');
    return;
  }
  
  // Handle special cards - this may change currentTurn
  const keepsTurn = card.value === 'Skip' || card.value === 'Reverse';
  handleCardEffect(card, 'player');
  
  // Only change turn if it wasn't a skip/reverse card
  if (!keepsTurn) {
    gameState.currentTurn = 'ai';
  }
  
  gameState.turnCount++;
  renderGameUI();
  saveGameState();
  
  log('Player played:', formatCard(card));
}

function drawCard() {
  if (!gameState.active || gameState.currentTurn !== 'player') return;
  
  const drawn = gameState.deck.draw(1);
  if (drawn.length > 0) {
    gameState.playerHand.push(...drawn);
    toastr.info(`Drew: ${formatCard(drawn[0])}`);
    gameState.currentTurn = 'ai';
    renderGameUI();
    saveGameState();
  }
}

function handleCardEffect(card, playedBy) {
  const opponent = playedBy === 'player' ? 'ai' : 'player';
  
  if (card.value === 'Skip') {
    // Skip opponent's turn - current player goes again
    gameState.currentTurn = playedBy;
    toastr.info(playedBy === 'player' ? 'AI turn skipped!' : 'Your turn skipped!');
  } else if (card.value === 'Reverse') {
    // In 2-player, Reverse acts like Skip
    gameState.direction *= -1;
    gameState.currentTurn = playedBy; // Current player goes again
    toastr.info('Reverse! You go again~');
  } else if (card.value === '+2') {
    const drawn = gameState.deck.draw(2);
    if (opponent === 'ai') {
      gameState.aiHand.push(...drawn);
      toastr.info('AI draws 2 cards!');
    } else {
      gameState.playerHand.push(...drawn);
      toastr.warning('You draw 2 cards!');
    }
  } else if (card.value === 'Wild +4') {
    const drawn = gameState.deck.draw(4);
    if (opponent === 'ai') {
      gameState.aiHand.push(...drawn);
      toastr.info('AI draws 4 cards!');
    } else {
      gameState.playerHand.push(...drawn);
      toastr.warning('You draw 4 cards!');
    }
  }
}

function formatCard(card) {
  if (!card) return '???';
  if (card.type === 'wild') return card.value;
  return `${card.color} ${card.value}`;
}

// ============================================================================
// AI TURN PROCESSING
// ============================================================================

function getLastAIMessageFromDOM() {
  // Get all AI messages from the chat
  const messages = document.querySelectorAll('.mes:not([is_user="true"])');
  if (messages.length === 0) return null;
  
  const lastMsg = messages[messages.length - 1];
  const mesText = lastMsg.querySelector('.mes_text');
  if (!mesText) return null;
  
  // Get the raw HTML to find hidden tags
  return mesText.innerHTML || mesText.textContent || '';
}

function getLastAIMessageFromContext() {
  try {
    const context = SillyTavern.getContext();
    if (context.chat && context.chat.length > 0) {
      for (let i = context.chat.length - 1; i >= 0; i--) {
        const msg = context.chat[i];
        if (!msg.is_user && !msg.is_system && msg.mes) {
          return msg.mes;
        }
      }
    }
  } catch (e) {
    log('Error getting message from context:', e);
  }
  return null;
}

function parseAIChoice(messageContent) {
  if (!messageContent) return null;
  
  log('Parsing message for AI choice...');
  log('Message content:', messageContent.substring(0, 500));
  
  // Try to find game_state tags
  const stateMatch = messageContent.match(PATTERNS.gameState);
  if (stateMatch) {
    log('Found <game_state> block');
    const selectedMatch = stateMatch[1].match(PATTERNS.aiSelected);
    if (selectedMatch) {
      const choice = selectedMatch[1].trim();
      log('Found AI choice:', choice);
      return choice;
    }
  }
  
  // Fallback: look for ai_selected directly (in case game_state tag is malformed)
  const directMatch = messageContent.match(PATTERNS.aiSelected);
  if (directMatch) {
    const choice = directMatch[1].trim();
    log('Found AI choice (direct):', choice);
    return choice;
  }
  
  log('No AI choice found in message');
  return null;
}

function processAIChoice(choice) {
  if (!gameState.active) return false;
  
  log('Processing AI choice:', choice);
  
  const choiceLower = choice.toLowerCase();
  
  // Check for draw
  if (choiceLower.includes('draw')) {
    const drawn = gameState.deck.draw(1);
    if (drawn.length > 0) {
      gameState.aiHand.push(...drawn);
      toastr.info('AI drew a card');
    }
    gameState.currentTurn = 'player';
    renderGameUI();
    saveGameState();
    return true;
  }
  
  // Find matching card in AI hand
  let playedCard = null;
  let cardIndex = -1;
  
  for (let i = 0; i < gameState.aiHand.length; i++) {
    const card = gameState.aiHand[i];
    const cardName = formatCard(card).toLowerCase();
    
    if (cardName === choiceLower ||
        cardName.includes(choiceLower) || 
        choiceLower.includes(cardName) ||
        (card.color && choiceLower.includes(card.color.toLowerCase()) && choiceLower.includes(card.value.toLowerCase()))) {
      playedCard = card;
      cardIndex = i;
      break;
    }
  }
  
  if (!playedCard) {
    log('Could not match card:', choice);
    log('AI hand:', gameState.aiHand.map(formatCard));
    toastr.warning(`Could not find card: ${choice}. AI draws instead.`);
    const drawn = gameState.deck.draw(1);
    if (drawn.length > 0) gameState.aiHand.push(...drawn);
    gameState.currentTurn = 'player';
    renderGameUI();
    saveGameState();
    return true;
  }
  
  // Validate play
  const topCard = gameState.deck.topDiscard;
  if (!isValidPlay(playedCard, topCard, gameState.activeColor)) {
    toastr.warning(`${formatCard(playedCard)} is invalid. AI draws instead.`);
    const drawn = gameState.deck.draw(1);
    if (drawn.length > 0) gameState.aiHand.push(...drawn);
    gameState.currentTurn = 'player';
    renderGameUI();
    saveGameState();
    return true;
  }
  
  // Play the card!
  gameState.aiHand.splice(cardIndex, 1);
  gameState.deck.addToDiscard(playedCard);
  
  toastr.info(`AI played: ${formatCard(playedCard)}`);
  
  if (playedCard.type === 'wild') {
    const colorCounts = {};
    gameState.aiHand.forEach(c => {
      if (c.color) colorCounts[c.color] = (colorCounts[c.color] || 0) + 1;
    });
    const best = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0];
    gameState.activeColor = best ? best[0] : 'Red';
    toastr.info(`AI chose: ${gameState.activeColor}`);
  } else {
    gameState.activeColor = playedCard.color;
  }
  
  if (gameState.aiHand.length === 0) {
    toastr.warning('AI WINS!', 'Uno');
    endGame('ai_win');
    return true;
  }
  
  // Check if AI should call Uno (1 card left)
  if (gameState.aiHand.length === 1) {
    toastr.info('AI calls UNO!', 'Uno');
  }
  
  // Handle effects - may change turn
  const keepsTurn = playedCard.value === 'Skip' || playedCard.value === 'Reverse';
  handleCardEffect(playedCard, 'ai');
  
  // Only change turn if it wasn't a skip/reverse
  if (!keepsTurn) {
    gameState.currentTurn = 'player';
  }
  
  gameState.turnCount++;
  renderGameUI();
  saveGameState();
  return true;
}

function tryProcessAITurn() {
  if (!gameState.active || gameState.currentTurn !== 'ai') {
    toastr.warning('Not AI turn!');
    return false;
  }
  
  // Try context first, then DOM
  let message = getLastAIMessageFromContext();
  if (!message) {
    message = getLastAIMessageFromDOM();
  }
  
  if (!message) {
    toastr.error('Could not find AI message');
    return false;
  }
  
  const choice = parseAIChoice(message);
  if (!choice) {
    toastr.error('AI did not include <game_state><ai_selected>...</ai_selected></game_state> tags!');
    log('Full message was:', message);
    return false;
  }
  
  return processAIChoice(choice);
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
  
  return `[UNO GAME - Turn ${gameState.turnCount + 1}]

YOUR CARDS: ${aiHandStr}
TOP CARD: ${formatCard(topCard)}
ACTIVE COLOR: ${gameState.activeColor || topCard?.color}
YOUR VALID PLAYS: ${validPlays.length > 0 ? validPlays.join(', ') : 'NONE - must draw'}

CARD RULES:
- Skip/Reverse = Opponent loses their turn (you go again!)
- +2 = Opponent draws 2 cards
- Wild = Pick any color
- Wild +4 = Pick color + opponent draws 4

⚠️ You MUST include your choice in EXACTLY this format:
<game_state>
<ai_selected>CARD NAME HERE</ai_selected>
</game_state>

Example: <game_state><ai_selected>Red 5</ai_selected></game_state>
Or to draw: <game_state><ai_selected>draw</ai_selected></game_state>

If you have 1 card left, say "UNO!" in your roleplay!
Stay in character! The tags are hidden from the player.
[END UNO]`;
}

globalThis.cardGamePromptInterceptor = async function(chat, contextSize, abort, type) {
  if (!gameState.active || gameState.currentTurn !== 'ai') return;
  
  const prompt = generateGamePrompt();
  if (!prompt) return;
  
  log('Injecting game prompt');
  
  chat.splice(Math.max(0, chat.length - 1), 0, {
    is_user: false,
    is_system: true,
    mes: prompt,
    extra: { isCardGame: true },
  });
};

// ============================================================================
// UI
// ============================================================================

function renderGameUI() {
  if (!gameState.active) return;
  
  let panel = document.getElementById('card-game-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'card-game-panel';
    document.body.appendChild(panel);
  }
  
  // Check if minimized
  const isMinimized = gameState.minimized;
  
  const topCard = gameState.deck.topDiscard;
  const validPlays = getValidPlays();
  const isAITurn = gameState.currentTurn === 'ai';
  const turnIndicator = isAITurn ? '⏳' : '👉';
  
  panel.innerHTML = `
    <div class="cg-header">
      <span class="cg-title">
        <span>🎴</span>
        <span class="cg-title-text">Uno</span>
        <span class="cg-badge">${turnIndicator} ${gameState.playerHand.length}</span>
      </span>
      <div class="cg-controls">
        <button class="cg-btn cg-minimize" onclick="window.cardGameToggleMinimize()" title="${isMinimized ? 'Expand' : 'Minimize'}">${isMinimized ? '▲' : '▼'}</button>
        <button class="cg-btn" onclick="window.cardGameDrawCard()" ${isAITurn ? 'disabled' : ''}>Draw</button>
        <button class="cg-btn cg-close" onclick="window.cardGameEnd()">✕</button>
      </div>
    </div>
    <div class="cg-body">
      <div class="cg-info">
        <div class="cg-turn ${!isAITurn ? 'your-turn' : 'ai-turn'}">
          ${!isAITurn ? '👉 Your Turn' : '⏳ Waiting for AI...'}
        </div>
        <div class="cg-stats">
          AI: ${gameState.aiHand.length} | Deck: ${gameState.deck.remaining}
        </div>
      </div>
      
      ${gameState.playerNeedsUno && !gameState.playerCalledUno ? `
        <div class="cg-uno-alert">
          <button class="cg-btn cg-uno-btn" onclick="window.cardGameCallUno()">🎴 UNO!</button>
          <span>Call it or draw 2!</span>
        </div>
      ` : ''}
      
      ${isAITurn ? `
        <div class="cg-ai-help">
          <p>After AI responds:</p>
          <button class="cg-btn cg-process" onclick="window.cardGameProcessAI()">🔄 Process</button>
          <button class="cg-btn cg-skip" onclick="window.cardGameSkipAI()">⏭️ Skip</button>
        </div>
      ` : ''}
      
      <div class="cg-discard">
        <div class="cg-label">Top Card</div>
        <div class="cg-card cg-${(topCard?.color || 'wild').toLowerCase()}">${formatCard(topCard)}</div>
        ${gameState.activeColor !== topCard?.color ? `<div class="cg-color-note">Color: ${gameState.activeColor}</div>` : ''}
      </div>
      
      <div class="cg-hand">
        <div class="cg-label">Your Hand (${gameState.playerHand.length})</div>
        <div class="cg-cards">
          ${gameState.playerHand.map(card => {
            const isValid = validPlays.some(v => v.id === card.id);
            const classes = `cg-card cg-${(card.color || 'wild').toLowerCase()} ${isValid ? 'cg-valid' : 'cg-invalid'} ${isAITurn ? 'cg-disabled' : ''}`;
            return `<div class="${classes}" onclick="window.cardGamePlayCard('${card.id}')" title="${formatCard(card)}">${formatCard(card)}</div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
  
  panel.style.display = 'block';
  
  // Apply minimized state
  if (gameState.minimized) {
    panel.classList.add('cg-minimized');
  } else {
    panel.classList.remove('cg-minimized');
  }
}

function hideGameUI() {
  const panel = document.getElementById('card-game-panel');
  if (panel) panel.style.display = 'none';
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function saveGameState() {
  try {
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
  } catch (e) {
    log('Error saving:', e);
  }
}

function loadGameState() {
  try {
    const context = SillyTavern.getContext();
    const saved = context.chatMetadata?.card_game;
    
    if (saved?.active) {
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
      log('Game loaded');
    }
  } catch (e) {
    log('Error loading:', e);
  }
}

function clearGameState() {
  try {
    const context = SillyTavern.getContext();
    if (context.chatMetadata) {
      delete context.chatMetadata.card_game;
      context.saveMetadata();
    }
  } catch (e) {
    log('Error clearing:', e);
  }
}

// ============================================================================
// GLOBAL HANDLERS
// ============================================================================

window.cardGamePlayCard = function(cardId) {
  if (gameState.currentTurn !== 'player') {
    toastr.warning("Wait for your turn!");
    return;
  }
  
  const card = gameState.playerHand.find(c => c.id === cardId);
  if (!card) return;
  
  if (!isValidPlay(card, gameState.deck.topDiscard, gameState.activeColor)) {
    toastr.warning("Can't play that card!");
    return;
  }
  
  if (card.type === 'wild') {
    const color = prompt('Choose color: Red, Yellow, Green, or Blue', 'Red');
    if (color && ['Red', 'Yellow', 'Green', 'Blue'].includes(color)) {
      playCard(card, color);
    }
  } else {
    playCard(card);
  }
};

window.cardGameDrawCard = drawCard;
window.cardGameEnd = () => endGame('manual');
window.cardGameProcessAI = tryProcessAITurn;
window.cardGameSkipAI = function() {
  if (!gameState.active || gameState.currentTurn !== 'ai') return;
  const drawn = gameState.deck.draw(1);
  if (drawn.length > 0) gameState.aiHand.push(...drawn);
  gameState.currentTurn = 'player';
  toastr.info('AI skipped, drew a card');
  renderGameUI();
  saveGameState();
};
window.cardGameToggleMinimize = function() {
  const panel = document.getElementById('card-game-panel');
  if (panel) {
    const isCurrentlyMinimized = panel.classList.contains('cg-minimized');
    gameState.minimized = !isCurrentlyMinimized;
    panel.classList.toggle('cg-minimized');
  }
};

window.cardGameCallUno = function() {
  if (!gameState.active) return;
  
  if (gameState.playerNeedsUno) {
    gameState.playerCalledUno = true;
    gameState.playerNeedsUno = false;
    toastr.success('UNO! 🎴', 'Called it!');
    renderGameUI();
    saveGameState();
  }
};

// Check if player forgot to call Uno (called when turn changes to player)
function checkUnoForgotten() {
  if (gameState.playerNeedsUno && !gameState.playerCalledUno && gameState.playerHand.length === 1) {
    // Player forgot! Penalty: draw 2
    toastr.error('You forgot to call UNO! Draw 2 cards!', 'Penalty!');
    const drawn = gameState.deck.draw(2);
    gameState.playerHand.push(...drawn);
    gameState.playerNeedsUno = false;
    renderGameUI();
    saveGameState();
  }
}

// ============================================================================
// SETTINGS
// ============================================================================

function getSettings() {
  const context = SillyTavern.getContext();
  if (!context.extensionSettings[MODULE_NAME]) {
    context.extensionSettings[MODULE_NAME] = { ...defaultSettings };
  }
  return context.extensionSettings[MODULE_NAME];
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleMessageReceived(data) {
  if (!gameState.active || gameState.currentTurn !== 'ai') return;
  
  log('Message received event');
  
  // Auto-process after short delay
  setTimeout(() => {
    if (gameState.currentTurn === 'ai') {
      const message = getLastAIMessageFromContext() || getLastAIMessageFromDOM();
      if (message) {
        const choice = parseAIChoice(message);
        if (choice) {
          processAIChoice(choice);
        }
      }
    }
  }, 1000);
}

function handleMessageSent(data) {
  if (!getSettings().autoStartOnKeyword) return;
  
  const text = (data?.message || '').toLowerCase();
  
  for (const [gameType, keywords] of Object.entries(GAME_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw)) && !gameState.active) {
      setTimeout(() => startGame(gameType), 500);
      break;
    }
  }
}

function handleChatChanged() {
  hideGameUI();
  gameState.active = false;
  setTimeout(loadGameState, 100);
}

// ============================================================================
// INIT
// ============================================================================

jQuery(async () => {
  log('Initializing Card Games...');
  
  const context = SillyTavern.getContext();
  
  const settingsHtml = `
    <div class="card-games-settings">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>🎴 Card Games</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <label style="display:flex;gap:8px;margin:8px 0">
            <input type="checkbox" id="cg_auto_detect" checked>
            <span>Auto-detect "let's play uno"</span>
          </label>
          <hr>
          <button class="menu_button" id="cg_start">▶️ Start Uno</button>
          <button class="menu_button" id="cg_end">⏹️ End Game</button>
        </div>
      </div>
    </div>
  `;
  
  $('#extensions_settings').append(settingsHtml);
  
  $('#cg_start').on('click', () => startGame('uno'));
  $('#cg_end').on('click', () => endGame('manual'));
  $('#cg_auto_detect').on('change', function() {
    getSettings().autoStartOnKeyword = this.checked;
    context.saveSettingsDebounced();
  });
  
  const eventSource = context.eventSource;
  const eventTypes = context.event_types;
  
  if (eventTypes.MESSAGE_RECEIVED) {
    eventSource.on(eventTypes.MESSAGE_RECEIVED, handleMessageReceived);
  }
  if (eventTypes.MESSAGE_SENT) {
    eventSource.on(eventTypes.MESSAGE_SENT, handleMessageSent);
  }
  if (eventTypes.CHAT_CHANGED) {
    eventSource.on(eventTypes.CHAT_CHANGED, handleChatChanged);
  }
  
  loadGameState();
  
  log('Card Games ready! Say "let\'s play uno" or use /cardgame start uno');
});
