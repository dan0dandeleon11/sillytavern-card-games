/**
 * GameBridge - Connect SillyTavern to external browser card games
 * 
 * Supports:
 * - Pretend You're Xyzzy (PYX) - open source CAH
 * - netgames.io - various party games
 * - Custom game sites via scraper configs
 * 
 * Architecture:
 * 1. User installs companion browser extension/userscript on game site
 * 2. Companion scrapes game state and sends to relay
 * 3. ST extension receives state, shows to AI
 * 4. AI responds with <game_choice> tag
 * 5. Extension sends choice back to companion
 * 6. Companion inputs choice into browser game
 */

export class GameBridge {
  constructor(options = {}) {
    this.options = {
      relayUrl: options.relayUrl || 'ws://localhost:9876',
      onGameState: options.onGameState || (() => {}),
      onConnectionChange: options.onConnectionChange || (() => {}),
      onError: options.onError || (() => {}),
    };
    
    this.socket = null;
    this.isConnected = false;
    this.currentGame = null;
    this.lastGameState = null;
    this.pendingChoice = null;
    
    // Message tag for AI responses
    this.CHOICE_TAG = 'game_choice';
    this.CHOICE_REGEX = /<game_choice>([\s\S]*?)<\/game_choice>/i;
  }
  
  /**
   * Connect to the relay server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.options.relayUrl);
        
        this.socket.onopen = () => {
          console.log('[GameBridge] Connected to relay');
          this.isConnected = true;
          this.options.onConnectionChange(true);
          resolve(true);
        };
        
        this.socket.onclose = () => {
          console.log('[GameBridge] Disconnected from relay');
          this.isConnected = false;
          this.options.onConnectionChange(false);
        };
        
        this.socket.onerror = (error) => {
          console.error('[GameBridge] WebSocket error:', error);
          this.options.onError(error);
          reject(error);
        };
        
        this.socket.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Disconnect from relay
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }
  
  /**
   * Handle incoming messages from the companion script
   */
  handleMessage(message) {
    console.log('[GameBridge] Received:', message.type);
    
    switch (message.type) {
      case 'game_state':
        this.handleGameState(message.data);
        break;
        
      case 'game_joined':
        this.handleGameJoined(message.data);
        break;
        
      case 'game_ended':
        this.handleGameEnded(message.data);
        break;
        
      case 'choice_confirmed':
        this.handleChoiceConfirmed(message.data);
        break;
        
      case 'error':
        this.options.onError(message.data);
        break;
        
      default:
        console.warn('[GameBridge] Unknown message type:', message.type);
    }
  }
  
  /**
   * Handle game state update from browser game
   */
  handleGameState(state) {
    this.lastGameState = state;
    this.currentGame = state.gameType;
    
    // Notify extension
    this.options.onGameState(state);
  }
  
  /**
   * Handle joining a game
   */
  handleGameJoined(data) {
    console.log('[GameBridge] Joined game:', data.gameId);
    this.currentGame = data.gameType;
    toastr.success(`Connected to ${data.gameName}!`, 'Game Bridge');
  }
  
  /**
   * Handle game ending
   */
  handleGameEnded(data) {
    console.log('[GameBridge] Game ended:', data.reason);
    this.currentGame = null;
    this.lastGameState = null;
  }
  
  /**
   * Handle confirmation that choice was input
   */
  handleChoiceConfirmed(data) {
    console.log('[GameBridge] Choice confirmed:', data.choice);
    this.pendingChoice = null;
  }
  
  /**
   * Send AI's choice to the browser game
   */
  sendChoice(choice) {
    if (!this.isConnected) {
      console.error('[GameBridge] Not connected');
      return false;
    }
    
    this.pendingChoice = choice;
    
    this.socket.send(JSON.stringify({
      type: 'make_choice',
      data: {
        choice: choice,
        gameType: this.currentGame,
        timestamp: Date.now(),
      }
    }));
    
    return true;
  }
  
  /**
   * Parse AI response for game choice
   */
  parseAIChoice(messageContent) {
    const match = messageContent.match(this.CHOICE_REGEX);
    if (!match) return null;
    
    const choiceText = match[1].trim();
    
    // Try to parse as JSON first
    try {
      return JSON.parse(choiceText);
    } catch (e) {
      // Return as plain text
      return { text: choiceText };
    }
  }
  
  /**
   * Generate prompt context for AI based on game state
   */
  generatePromptContext(state) {
    if (!state) return null;
    
    switch (state.gameType) {
      case 'pyx':
      case 'cah':
        return this.generateCAHPrompt(state);
      case 'netgames_wavelength':
        return this.generateWavelengthPrompt(state);
      case 'netgames_codenames':
        return this.generateCodenamesPrompt(state);
      default:
        return this.generateGenericPrompt(state);
    }
  }
  
  /**
   * Generate CAH/PYX specific prompt
   */
  generateCAHPrompt(state) {
    const { blackCard, whiteCards, phase, judge, players } = state;
    
    if (phase === 'playing') {
      return `[BROWSER GAME: Cards Against Humanity]
      
You are playing CAH in a browser game with real people!

BLACK CARD:
"${blackCard?.text || 'Loading...'}"
${blackCard?.pick > 1 ? `(Pick ${blackCard.pick} cards)` : ''}

YOUR WHITE CARDS:
${whiteCards?.map((c, i) => `${i + 1}. "${c.text}"`).join('\n') || 'Loading...'}

OTHER PLAYERS: ${players?.map(p => p.name).join(', ') || 'Loading...'}
JUDGE THIS ROUND: ${judge || 'Unknown'}

INSTRUCTIONS:
1. Pick the funniest card(s) to play
2. Put your choice in the hidden tag
3. Roleplay your reaction!

FORMAT:
*your reaction*

<game_choice>
{"cardIndex": 0}
</game_choice>

Or for multi-pick: {"cardIndices": [0, 2]}
[END GAME CONTEXT]`;
    }
    
    if (phase === 'judging' && state.isJudge) {
      return `[BROWSER GAME: Cards Against Humanity - YOU ARE THE JUDGE]

BLACK CARD:
"${blackCard?.text}"

SUBMITTED ANSWERS:
${state.submissions?.map((s, i) => `${i + 1}. "${s.text}"`).join('\n') || 'Loading...'}

Pick the funniest one!

<game_choice>
{"winnerIndex": 0}
</game_choice>
[END GAME CONTEXT]`;
    }
    
    return null; // Not our turn
  }
  
  /**
   * Generate Wavelength prompt
   */
  generateWavelengthPrompt(state) {
    if (state.phase === 'clue_giving' && state.isClueGiver) {
      return `[BROWSER GAME: Wavelength]

The spectrum is: "${state.leftEnd}" ◄────────► "${state.rightEnd}"
The target is at: ${state.targetPosition}% (hidden from guessers)

Give a ONE WORD clue that hints at where on the spectrum the target is!

<game_choice>
{"clue": "your one word clue"}
</game_choice>
[END GAME CONTEXT]`;
    }
    
    if (state.phase === 'guessing') {
      return `[BROWSER GAME: Wavelength]

Spectrum: "${state.leftEnd}" ◄────────► "${state.rightEnd}"
Clue given: "${state.clue}"

Where on the spectrum (0-100) do you think the target is?

<game_choice>
{"guess": 65}
</game_choice>
[END GAME CONTEXT]`;
    }
    
    return null;
  }
  
  /**
   * Generate Codenames prompt
   */
  generateCodenamesPrompt(state) {
    if (state.role === 'spymaster' && state.isMyTurn) {
      return `[BROWSER GAME: Codenames - YOU ARE SPYMASTER]

YOUR TEAM'S WORDS (need to find): ${state.teamWords?.join(', ')}
OPPONENT'S WORDS (avoid): ${state.opponentWords?.join(', ')}
NEUTRAL WORDS: ${state.neutralWords?.join(', ')}
ASSASSIN (instant loss if picked): ${state.assassin}

ALL VISIBLE WORDS:
${state.allWords?.join(', ')}

Give a ONE WORD clue and a NUMBER of words it relates to!

<game_choice>
{"clue": "OCEAN", "number": 3}
</game_choice>
[END GAME CONTEXT]`;
    }
    
    if (state.role === 'operative' && state.isMyTurn) {
      return `[BROWSER GAME: Codenames - YOU ARE GUESSING]

Clue: "${state.currentClue}" (${state.currentNumber})
Remaining words: ${state.remainingWords?.join(', ')}

Pick a word that matches the clue!

<game_choice>
{"word": "BEACH"}
</game_choice>
[END GAME CONTEXT]`;
    }
    
    return null;
  }
  
  /**
   * Generate generic game prompt
   */
  generateGenericPrompt(state) {
    return `[BROWSER GAME: ${state.gameName || 'Unknown Game'}]

GAME STATE:
${JSON.stringify(state, null, 2)}

YOUR OPTIONS:
${state.options?.map((o, i) => `${i + 1}. ${o}`).join('\n') || 'Check game window'}

Include your choice in:
<game_choice>
{"selection": "your choice here"}
</game_choice>
[END GAME CONTEXT]`;
  }
  
  /**
   * Check if we're waiting for AI to make a choice
   */
  isWaitingForChoice() {
    return this.lastGameState?.isMyTurn && !this.pendingChoice;
  }
  
  /**
   * Get current game info
   */
  getGameInfo() {
    return {
      connected: this.isConnected,
      gameType: this.currentGame,
      lastState: this.lastGameState,
      pendingChoice: this.pendingChoice,
    };
  }
}

/**
 * Message types for the bridge protocol
 */
export const BridgeMessageTypes = {
  // From companion to ST
  GAME_STATE: 'game_state',
  GAME_JOINED: 'game_joined', 
  GAME_ENDED: 'game_ended',
  CHOICE_CONFIRMED: 'choice_confirmed',
  ERROR: 'error',
  
  // From ST to companion
  MAKE_CHOICE: 'make_choice',
  JOIN_GAME: 'join_game',
  LEAVE_GAME: 'leave_game',
};

/**
 * Supported game sites and their configurations
 */
export const SupportedGames = {
  pyx: {
    name: 'Pretend You\'re Xyzzy',
    url: 'https://pyx-1.pretendyoure.xyz',
    urlPatterns: ['pretendyoure.xyz', 'pyx'],
    gameType: 'cah',
  },
  allbad: {
    name: 'All Bad Cards',
    url: 'https://allbad.cards',
    urlPatterns: ['allbad.cards'],
    gameType: 'cah',
  },
  netgames: {
    name: 'Netgames.io',
    url: 'https://netgames.io',
    urlPatterns: ['netgames.io'],
    gameType: 'various',
    subGames: ['wavelength', 'codenames', 'spyfall', 'fake_artist'],
  },
  playingcards: {
    name: 'PlayingCards.io',
    url: 'https://playingcards.io',
    urlPatterns: ['playingcards.io'],
    gameType: 'custom',
  },
};
