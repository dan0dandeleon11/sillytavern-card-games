/**
 * SillyTavern Card Games Extension
 * Play card games with your AI companions
 * 
 * @author Lei & Caleb
 * @version 0.1.0
 */

import { GameEngine } from './src/core/GameEngine.js';
import { CardDeck } from './src/core/CardDeck.js';
import { HiddenStateManager } from './src/core/HiddenStateManager.js';
import { GameUI } from './src/ui/GameUI.js';
import { PromptBuilder } from './src/ai/PromptBuilder.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MODULE_NAME = 'card_games';
const DEBUG = true;

// Regex patterns for parsing hidden game data from AI responses
const PATTERNS = {
  gameState: /<game_state>([\s\S]*?)<\/game_state>/gi,
  aiHand: /<ai_hand>([\s\S]*?)<\/ai_hand>/i,
  aiSelected: /<ai_selected>([\s\S]*?)<\/ai_selected>/i,
  aiReasoning: /<ai_reasoning>([\s\S]*?)<\/ai_reasoning>/i,
  gameAction: /<game_action>([\s\S]*?)<\/game_action>/i,
  gamePhase: /<game_phase>([\s\S]*?)<\/game_phase>/i,
};

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const defaultSettings = Object.freeze({
  enabled: true,
  currentGame: null,
  uiPosition: 'right', // 'left', 'right', 'bottom'
  uiMinimized: false,
  showAIThinking: false, // Debug: show AI reasoning
  autoStartOnKeyword: true, // Start game when user says "let's play uno" etc
  animationSpeed: 'normal', // 'slow', 'normal', 'fast'
  soundEnabled: false,
  customGames: [],
});

// ============================================================================
// STATE
// ============================================================================

let gameEngine = null;
let gameUI = null;
let hiddenStateManager = null;
let promptBuilder = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Main initialization - called when extension loads
 */
jQuery(async () => {
  const context = SillyTavern.getContext();
  
  // Initialize settings
  initializeSettings(context);
  
  // Initialize core systems
  hiddenStateManager = new HiddenStateManager(PATTERNS);
  promptBuilder = new PromptBuilder();
  gameEngine = new GameEngine({
    onStateChange: handleGameStateChange,
    onTurnChange: handleTurnChange,
    onGameEnd: handleGameEnd,
  });
  
  // Create UI
  gameUI = new GameUI({
    position: getSettings().uiPosition,
    onCardSelect: handleCardSelect,
    onDrawCard: handleDrawCard,
    onGameAction: handleGameAction,
    onMenuAction: handleMenuAction,
  });
  
  // Register event listeners
  registerEventListeners(context);
  
  // Register slash commands
  registerSlashCommands(context);
  
  // Load any active game from chat metadata
  await loadGameFromChat(context);
  
  isInitialized = true;
  log('Extension initialized');
});

/**
 * Initialize extension settings with defaults
 */
function initializeSettings(context) {
  const { extensionSettings } = context;
  
  if (!extensionSettings[MODULE_NAME]) {
    extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
  }
  
  // Ensure all default keys exist (for updates)
  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
      extensionSettings[MODULE_NAME][key] = defaultSettings[key];
    }
  }
}

/**
 * Get current settings
 */
function getSettings() {
  const { extensionSettings } = SillyTavern.getContext();
  return extensionSettings[MODULE_NAME];
}

/**
 * Save settings
 */
function saveSettings() {
  const { saveSettingsDebounced } = SillyTavern.getContext();
  saveSettingsDebounced();
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Register all SillyTavern event listeners
 */
function registerEventListeners(context) {
  const { eventSource, event_types } = context;
  
  // When AI sends a message - parse for hidden game data
  eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
  
  // When user sends a message - check for game commands
  eventSource.on(event_types.MESSAGE_SENT, handleMessageSent);
  
  // When chat changes - load/save game state
  eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
  
  // After message renders - we might add overlays
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleMessageRendered);
  
  // Generation events
  eventSource.on(event_types.GENERATION_STARTED, handleGenerationStarted);
  eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);
  
  log('Event listeners registered');
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Handle incoming AI messages - parse hidden game state
 */
function handleMessageReceived(data) {
  if (!getSettings().enabled || !gameEngine?.isActive()) return;
  
  const messageContent = data.message || '';
  
  // Parse hidden game state from message
  const parsedState = hiddenStateManager.parseMessage(messageContent);
  
  if (parsedState) {
    log('Parsed game state from AI:', parsedState);
    
    // Update game engine with AI's move
    if (parsedState.aiSelected) {
      gameEngine.processAIMove({
        card: parsedState.aiSelected,
        reasoning: parsedState.aiReasoning,
        action: parsedState.gameAction,
      });
    }
    
    // Update UI
    gameUI?.updateFromState(gameEngine.getState());
    
    // Show AI reasoning if debug mode
    if (getSettings().showAIThinking && parsedState.aiReasoning) {
      gameUI?.showAIThought(parsedState.aiReasoning);
    }
  }
}

/**
 * Handle user messages - check for game triggers
 */
function handleMessageSent(data) {
  if (!getSettings().enabled) return;
  
  const messageContent = (data.message || '').toLowerCase();
  
  // Check for game start triggers
  if (getSettings().autoStartOnKeyword) {
    const gameKeywords = {
      'uno': ['play uno', 'let\'s play uno', 'uno game', 'start uno'],
      'cah': ['play cards against humanity', 'play cah', 'cards against humanity'],
      'exploding_kittens': ['play exploding kittens', 'exploding kittens'],
    };
    
    for (const [gameId, keywords] of Object.entries(gameKeywords)) {
      if (keywords.some(kw => messageContent.includes(kw))) {
        startGame(gameId);
        break;
      }
    }
  }
  
  // Check for game actions in user message
  if (gameEngine?.isActive()) {
    // User might be playing a card by mentioning it
    const userPlay = gameEngine.detectUserPlay(messageContent);
    if (userPlay) {
      gameEngine.processUserMove(userPlay);
      gameUI?.updateFromState(gameEngine.getState());
    }
  }
}

/**
 * Handle chat change - load/save game state
 */
async function handleChatChanged() {
  // Save current game if exists
  if (gameEngine?.isActive()) {
    await saveGameToChat();
  }
  
  // Load game from new chat
  await loadGameFromChat(SillyTavern.getContext());
}

/**
 * Handle message render - add visual overlays if needed
 */
function handleMessageRendered(messageId) {
  // Could add card hover previews, game state indicators, etc.
}

/**
 * Handle generation start
 */
function handleGenerationStarted() {
  if (gameEngine?.isActive()) {
    gameUI?.setWaitingForAI(true);
  }
}

/**
 * Handle generation end
 */
function handleGenerationEnded() {
  if (gameEngine?.isActive()) {
    gameUI?.setWaitingForAI(false);
  }
}

// ============================================================================
// PROMPT INTERCEPTOR
// ============================================================================

/**
 * Global prompt interceptor - injects game context into AI prompts
 * This is called by SillyTavern before each generation
 */
globalThis.cardGamePromptInterceptor = async function(chat, contextSize, abort, type) {
  // Skip if extension disabled or no active game
  if (!getSettings().enabled || !gameEngine?.isActive()) return;
  
  // Skip for certain generation types
  if (type === 'quiet' || type === 'summarize') return;
  
  const gameState = gameEngine.getState();
  const gamePrompt = promptBuilder.buildPrompt(gameState);
  
  // Create a system message with game context
  const gameContextMessage = {
    is_user: false,
    is_system: true,
    name: 'Game Master',
    mes: gamePrompt,
    extra: { 
      isGameContext: true,
      gameType: gameState.gameType,
    },
  };
  
  // Insert before the last user message
  const insertIndex = Math.max(0, chat.length - 1);
  chat.splice(insertIndex, 0, gameContextMessage);
  
  log('Injected game context into prompt');
};

// ============================================================================
// GAME MANAGEMENT
// ============================================================================

/**
 * Start a new game
 */
async function startGame(gameId, options = {}) {
  log(`Starting game: ${gameId}`);
  
  try {
    // Load game rules
    const gameRules = await loadGameRules(gameId);
    
    // Initialize game engine
    gameEngine.startGame(gameRules, {
      players: [
        { id: 'user', name: getUserName(), isAI: false },
        { id: 'ai', name: getCharacterName(), isAI: true },
      ],
      ...options,
    });
    
    // Update settings
    const settings = getSettings();
    settings.currentGame = gameId;
    saveSettings();
    
    // Show UI
    gameUI?.show();
    gameUI?.updateFromState(gameEngine.getState());
    
    // Save to chat metadata
    await saveGameToChat();
    
    // Notify user
    toastr.success(`Started ${gameRules.name}!`, 'Card Games');
    
  } catch (error) {
    console.error('[CardGames] Failed to start game:', error);
    toastr.error(`Failed to start game: ${error.message}`, 'Card Games');
  }
}

/**
 * End current game
 */
async function endGame(reason = 'manual') {
  if (!gameEngine?.isActive()) return;
  
  log(`Ending game: ${reason}`);
  
  const finalState = gameEngine.endGame(reason);
  
  // Update settings
  const settings = getSettings();
  settings.currentGame = null;
  saveSettings();
  
  // Update UI
  gameUI?.showGameEnd(finalState);
  
  // Clear from chat metadata
  await clearGameFromChat();
  
  toastr.info('Game ended', 'Card Games');
}

/**
 * Load game rules from JSON
 */
async function loadGameRules(gameId) {
  // First check custom games
  const settings = getSettings();
  const customGame = settings.customGames.find(g => g.id === gameId);
  if (customGame) return customGame;
  
  // Load built-in game
  const response = await fetch(`/scripts/extensions/third-party/card-games-extension/games/${gameId}.json`);
  if (!response.ok) {
    throw new Error(`Game not found: ${gameId}`);
  }
  return response.json();
}

// ============================================================================
// CHAT METADATA (Per-Chat Game State)
// ============================================================================

/**
 * Save current game state to chat metadata
 */
async function saveGameToChat() {
  if (!gameEngine?.isActive()) return;
  
  const { chatMetadata, saveMetadata } = SillyTavern.getContext();
  
  chatMetadata['card_game'] = {
    version: 1,
    savedAt: Date.now(),
    state: gameEngine.serialize(),
  };
  
  await saveMetadata();
  log('Game saved to chat');
}

/**
 * Load game state from chat metadata
 */
async function loadGameFromChat(context) {
  const { chatMetadata } = context;
  
  const savedGame = chatMetadata['card_game'];
  if (!savedGame?.state) {
    gameUI?.hide();
    return;
  }
  
  try {
    // Restore game engine state
    await gameEngine.restore(savedGame.state);
    
    // Update settings
    const settings = getSettings();
    settings.currentGame = savedGame.state.gameType;
    
    // Show UI
    gameUI?.show();
    gameUI?.updateFromState(gameEngine.getState());
    
    log('Game loaded from chat');
  } catch (error) {
    console.error('[CardGames] Failed to restore game:', error);
    await clearGameFromChat();
  }
}

/**
 * Clear game from chat metadata
 */
async function clearGameFromChat() {
  const { chatMetadata, saveMetadata } = SillyTavern.getContext();
  delete chatMetadata['card_game'];
  await saveMetadata();
}

// ============================================================================
// UI EVENT HANDLERS
// ============================================================================

/**
 * Handle user selecting a card to play
 */
function handleCardSelect(card) {
  if (!gameEngine?.isActive()) return;
  if (!gameEngine.isUserTurn()) {
    toastr.warning('Wait for your turn!', 'Card Games');
    return;
  }
  
  const validation = gameEngine.validatePlay(card, 'user');
  if (!validation.valid) {
    toastr.warning(validation.reason, 'Card Games');
    return;
  }
  
  // Process the play
  gameEngine.processUserMove({ type: 'play', card });
  gameUI?.updateFromState(gameEngine.getState());
  
  // Save state
  saveGameToChat();
}

/**
 * Handle user drawing a card
 */
function handleDrawCard() {
  if (!gameEngine?.isActive()) return;
  if (!gameEngine.isUserTurn()) {
    toastr.warning('Wait for your turn!', 'Card Games');
    return;
  }
  
  gameEngine.processUserMove({ type: 'draw' });
  gameUI?.updateFromState(gameEngine.getState());
  saveGameToChat();
}

/**
 * Handle game-specific actions (e.g., calling Uno, challenging)
 */
function handleGameAction(action) {
  if (!gameEngine?.isActive()) return;
  
  const result = gameEngine.processGameAction(action);
  if (result.success) {
    gameUI?.updateFromState(gameEngine.getState());
    saveGameToChat();
  } else {
    toastr.warning(result.message, 'Card Games');
  }
}

/**
 * Handle menu actions (new game, settings, etc.)
 */
function handleMenuAction(action) {
  switch (action) {
    case 'new_game':
      showGameSelector();
      break;
    case 'end_game':
      endGame('manual');
      break;
    case 'settings':
      showSettings();
      break;
    case 'minimize':
      gameUI?.toggleMinimize();
      break;
  }
}

// ============================================================================
// GAME STATE CALLBACKS
// ============================================================================

function handleGameStateChange(newState) {
  gameUI?.updateFromState(newState);
}

function handleTurnChange(player) {
  if (player.isAI) {
    gameUI?.setWaitingForAI(true);
  } else {
    gameUI?.highlightUserTurn();
  }
}

function handleGameEnd(result) {
  gameUI?.showGameEnd(result);
  
  const settings = getSettings();
  settings.currentGame = null;
  saveSettings();
  
  clearGameFromChat();
}

// ============================================================================
// SLASH COMMANDS
// ============================================================================

/**
 * Register slash commands for game control
 */
function registerSlashCommands(context) {
  const { SlashCommandParser, SlashCommand, ARGUMENT_TYPE, SlashCommandArgument } = context;
  
  // /cardgame start <game>
  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'cardgame',
    callback: handleCardGameCommand,
    aliases: ['cg'],
    returns: 'Game action result',
    unnamedArgumentList: [
      SlashCommandArgument.fromProps({
        description: 'Action: start, end, status, draw, play',
        typeList: [ARGUMENT_TYPE.STRING],
        isRequired: true,
      }),
      SlashCommandArgument.fromProps({
        description: 'Argument (game name or card)',
        typeList: [ARGUMENT_TYPE.STRING],
        isRequired: false,
      }),
    ],
    helpString: `
      <div>Card game commands:</div>
      <ul>
        <li><code>/cardgame start uno</code> - Start a game of Uno</li>
        <li><code>/cardgame end</code> - End current game</li>
        <li><code>/cardgame status</code> - Show game status</li>
        <li><code>/cardgame draw</code> - Draw a card</li>
        <li><code>/cardgame play Red 7</code> - Play a specific card</li>
      </ul>
    `,
  }));
}

/**
 * Handle /cardgame slash command
 */
async function handleCardGameCommand(args, value) {
  const [action, ...rest] = value.split(' ');
  const argument = rest.join(' ');
  
  switch (action?.toLowerCase()) {
    case 'start':
      await startGame(argument || 'uno');
      return 'Game started';
      
    case 'end':
      await endGame('command');
      return 'Game ended';
      
    case 'status':
      if (!gameEngine?.isActive()) return 'No active game';
      const state = gameEngine.getState();
      return `Playing ${state.gameType}. Turn: ${state.currentPlayer}. Your cards: ${state.userHand.length}`;
      
    case 'draw':
      handleDrawCard();
      return 'Drew a card';
      
    case 'play':
      if (!argument) return 'Specify a card to play';
      // Find card in hand matching the description
      const card = gameEngine.findCardInHand(argument, 'user');
      if (card) {
        handleCardSelect(card);
        return `Played ${card.name}`;
      }
      return 'Card not found in hand';
      
    default:
      return 'Unknown action. Use: start, end, status, draw, play';
  }
}

// ============================================================================
// UI DIALOGS
// ============================================================================

function showGameSelector() {
  const { Popup } = SillyTavern.getContext();
  
  // TODO: Implement proper game selector UI
  Popup.show.input('Start Game', 'Enter game name (uno, cah, exploding_kittens):', 'uno')
    .then(gameName => {
      if (gameName) startGame(gameName);
    });
}

function showSettings() {
  // TODO: Open settings panel
  document.getElementById('card-games-settings')?.click();
}

// ============================================================================
// UTILITIES
// ============================================================================

function getUserName() {
  const { name1 } = SillyTavern.getContext();
  return name1 || 'User';
}

function getCharacterName() {
  const { name2 } = SillyTavern.getContext();
  return name2 || 'Character';
}

function log(...args) {
  if (DEBUG) {
    console.log('[CardGames]', ...args);
  }
}

// ============================================================================
// EXPORTS (for other modules)
// ============================================================================

export {
  startGame,
  endGame,
  getSettings,
  saveSettings,
  MODULE_NAME,
};
