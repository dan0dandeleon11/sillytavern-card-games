// ==UserScript==
// @name         SillyTavern Card Game Bridge
// @namespace    https://github.com/sillytavern
// @version      1.0.0
// @description  Connect browser card games to SillyTavern AI companions
// @author       Lei & Caleb
// @match        *://pyx-1.pretendyoure.xyz/*
// @match        *://pyx-2.pretendyoure.xyz/*
// @match        *://pyx-3.pretendyoure.xyz/*
// @match        *://*.pretendyoure.xyz/*
// @match        *://allbad.cards/*
// @match        *://netgames.io/*
// @match        *://playingcards.io/*
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
  'use strict';
  
  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    relayUrl: 'ws://localhost:9876',
    pollInterval: 1000,        // How often to check game state (ms)
    reconnectDelay: 3000,      // Delay before reconnect attempt (ms)
    maxReconnectAttempts: 10,
    debug: true,
  };
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  let socket = null;
  let isConnected = false;
  let reconnectAttempts = 0;
  let lastGameState = null;
  let pollIntervalId = null;
  let gameType = detectGameType();
  
  // ============================================================================
  // LOGGING
  // ============================================================================
  
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[ST-Bridge]', ...args);
    }
  }
  
  function error(...args) {
    console.error('[ST-Bridge]', ...args);
  }
  
  // ============================================================================
  // GAME DETECTION
  // ============================================================================
  
  function detectGameType() {
    const url = window.location.href;
    
    if (url.includes('pretendyoure.xyz') || url.includes('pyx')) {
      return 'pyx';
    }
    if (url.includes('allbad.cards')) {
      return 'allbad';
    }
    if (url.includes('netgames.io')) {
      // Detect specific netgames game
      if (url.includes('wavelength')) return 'netgames_wavelength';
      if (url.includes('codenames')) return 'netgames_codenames';
      if (url.includes('spyfall')) return 'netgames_spyfall';
      return 'netgames_unknown';
    }
    if (url.includes('playingcards.io')) {
      return 'playingcards';
    }
    
    return 'unknown';
  }
  
  // ============================================================================
  // WEBSOCKET CONNECTION
  // ============================================================================
  
  function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return;
    }
    
    log('Connecting to relay...', CONFIG.relayUrl);
    
    try {
      socket = new WebSocket(CONFIG.relayUrl);
      
      socket.onopen = () => {
        log('Connected to SillyTavern relay!');
        isConnected = true;
        reconnectAttempts = 0;
        showNotification('Connected', 'SillyTavern bridge is active!');
        
        // Send initial game info
        sendMessage('game_joined', {
          gameType: gameType,
          gameName: getGameName(),
          gameId: getGameId(),
          url: window.location.href,
        });
        
        // Start polling for game state
        startPolling();
      };
      
      socket.onclose = () => {
        log('Disconnected from relay');
        isConnected = false;
        stopPolling();
        attemptReconnect();
      };
      
      socket.onerror = (err) => {
        error('WebSocket error:', err);
      };
      
      socket.onmessage = (event) => {
        handleMessage(JSON.parse(event.data));
      };
      
    } catch (err) {
      error('Failed to connect:', err);
      attemptReconnect();
    }
  }
  
  function attemptReconnect() {
    if (reconnectAttempts >= CONFIG.maxReconnectAttempts) {
      error('Max reconnection attempts reached');
      return;
    }
    
    reconnectAttempts++;
    log(`Reconnecting in ${CONFIG.reconnectDelay}ms (attempt ${reconnectAttempts})`);
    
    setTimeout(connect, CONFIG.reconnectDelay);
  }
  
  function sendMessage(type, data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      error('Cannot send - not connected');
      return false;
    }
    
    socket.send(JSON.stringify({ type, data, timestamp: Date.now() }));
    return true;
  }
  
  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================
  
  function handleMessage(message) {
    log('Received:', message.type);
    
    switch (message.type) {
      case 'make_choice':
        handleMakeChoice(message.data);
        break;
        
      case 'ping':
        sendMessage('pong', {});
        break;
        
      default:
        log('Unknown message type:', message.type);
    }
  }
  
  function handleMakeChoice(data) {
    log('AI wants to make choice:', data.choice);
    
    const success = inputChoice(data.choice);
    
    sendMessage('choice_confirmed', {
      success,
      choice: data.choice,
    });
    
    if (success) {
      showNotification('Choice Made', 'AI played: ' + formatChoice(data.choice));
    }
  }
  
  // ============================================================================
  // GAME STATE POLLING
  // ============================================================================
  
  function startPolling() {
    if (pollIntervalId) return;
    
    pollIntervalId = setInterval(() => {
      const state = scrapeGameState();
      
      // Only send if state changed
      if (JSON.stringify(state) !== JSON.stringify(lastGameState)) {
        lastGameState = state;
        sendMessage('game_state', state);
      }
    }, CONFIG.pollInterval);
    
    log('Started polling game state');
  }
  
  function stopPolling() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  }
  
  // ============================================================================
  // GAME-SPECIFIC SCRAPERS
  // ============================================================================
  
  function scrapeGameState() {
    switch (gameType) {
      case 'pyx':
        return scrapePYX();
      case 'allbad':
        return scrapeAllBad();
      case 'netgames_wavelength':
        return scrapeWavelength();
      case 'netgames_codenames':
        return scrapeCodenames();
      default:
        return scrapeGeneric();
    }
  }
  
  /**
   * Scrape Pretend You're Xyzzy game state
   */
  function scrapePYX() {
    const state = {
      gameType: 'pyx',
      gameName: 'Cards Against Humanity',
      phase: 'unknown',
      isMyTurn: false,
      blackCard: null,
      whiteCards: [],
      submissions: [],
      players: [],
      judge: null,
      isJudge: false,
    };
    
    try {
      // Get black card
      const blackCardEl = document.querySelector('#game_black_card .card_text');
      if (blackCardEl) {
        state.blackCard = {
          text: blackCardEl.textContent.trim(),
          pick: (blackCardEl.textContent.match(/_{2,}/g) || []).length || 1,
        };
      }
      
      // Get white cards in hand
      const handCards = document.querySelectorAll('#game_hand .game_hand_cards .card_holder');
      state.whiteCards = Array.from(handCards).map((card, index) => ({
        text: card.querySelector('.card_text')?.textContent.trim() || '',
        index: index,
        element: card, // Keep reference for clicking
      }));
      
      // Check if we can play (have the play button)
      const playButton = document.querySelector('#game_hand_play');
      state.isMyTurn = playButton && !playButton.disabled;
      
      // Get submitted cards (during judging)
      const submissions = document.querySelectorAll('#game_white_cards .card_holder');
      state.submissions = Array.from(submissions).map((card, index) => ({
        text: card.querySelector('.card_text')?.textContent.trim() || '',
        index: index,
      }));
      
      // Determine phase
      if (state.submissions.length > 0) {
        state.phase = 'judging';
      } else if (state.blackCard) {
        state.phase = 'playing';
      }
      
      // Get players
      const playerRows = document.querySelectorAll('#game_score_table tr');
      state.players = Array.from(playerRows).slice(1).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          name: cells[0]?.textContent.trim() || '',
          score: parseInt(cells[1]?.textContent) || 0,
          isJudge: row.classList.contains('game_judge'),
        };
      });
      
      // Find judge
      const judge = state.players.find(p => p.isJudge);
      state.judge = judge?.name;
      
      // Check if we're the judge
      const myName = document.querySelector('#nickname')?.value;
      state.isJudge = state.judge === myName;
      
    } catch (err) {
      error('Error scraping PYX:', err);
    }
    
    return state;
  }
  
  /**
   * Scrape All Bad Cards game state
   */
  function scrapeAllBad() {
    const state = {
      gameType: 'allbad',
      gameName: 'All Bad Cards',
      phase: 'unknown',
      isMyTurn: false,
      blackCard: null,
      whiteCards: [],
    };
    
    try {
      // All Bad Cards uses React - look for specific classes
      const blackCard = document.querySelector('[class*="BlackCard"]');
      if (blackCard) {
        state.blackCard = {
          text: blackCard.textContent.trim(),
          pick: 1, // Would need to parse
        };
      }
      
      // Get hand cards
      const handCards = document.querySelectorAll('[class*="WhiteCard"]');
      state.whiteCards = Array.from(handCards).map((card, index) => ({
        text: card.textContent.trim(),
        index: index,
      }));
      
    } catch (err) {
      error('Error scraping All Bad Cards:', err);
    }
    
    return state;
  }
  
  /**
   * Scrape Netgames Wavelength
   */
  function scrapeWavelength() {
    const state = {
      gameType: 'netgames_wavelength',
      gameName: 'Wavelength',
      phase: 'unknown',
      isMyTurn: false,
      leftEnd: '',
      rightEnd: '',
      clue: '',
      targetPosition: null,
      isClueGiver: false,
    };
    
    try {
      // Wavelength specific scraping
      const spectrum = document.querySelector('.spectrum-labels');
      if (spectrum) {
        const labels = spectrum.querySelectorAll('span');
        state.leftEnd = labels[0]?.textContent.trim() || '';
        state.rightEnd = labels[1]?.textContent.trim() || '';
      }
      
      // Check role and phase from UI elements
      // This would need to be adapted to actual Wavelength HTML structure
      
    } catch (err) {
      error('Error scraping Wavelength:', err);
    }
    
    return state;
  }
  
  /**
   * Scrape Codenames
   */
  function scrapeCodenames() {
    const state = {
      gameType: 'netgames_codenames',
      gameName: 'Codenames',
      phase: 'unknown',
      role: 'unknown',
      isMyTurn: false,
      allWords: [],
      currentClue: '',
      currentNumber: 0,
    };
    
    try {
      // Codenames specific scraping
      const words = document.querySelectorAll('.word-card');
      state.allWords = Array.from(words).map(w => w.textContent.trim());
      
      // Get current clue if any
      const clueEl = document.querySelector('.current-clue');
      if (clueEl) {
        state.currentClue = clueEl.textContent.trim();
      }
      
    } catch (err) {
      error('Error scraping Codenames:', err);
    }
    
    return state;
  }
  
  /**
   * Generic scraper for unknown games
   */
  function scrapeGeneric() {
    return {
      gameType: 'unknown',
      gameName: document.title,
      phase: 'unknown',
      isMyTurn: false,
      url: window.location.href,
      // Could add more generic detection here
    };
  }
  
  // ============================================================================
  // GAME-SPECIFIC INPUT HANDLERS
  // ============================================================================
  
  function inputChoice(choice) {
    switch (gameType) {
      case 'pyx':
        return inputPYXChoice(choice);
      case 'allbad':
        return inputAllBadChoice(choice);
      default:
        log('No input handler for game type:', gameType);
        return false;
    }
  }
  
  /**
   * Input choice for PYX
   */
  function inputPYXChoice(choice) {
    try {
      const state = scrapePYX();
      
      if (state.phase === 'playing' && !state.isJudge) {
        // Select white card(s)
        const indices = choice.cardIndices || [choice.cardIndex];
        
        for (const index of indices) {
          const card = state.whiteCards[index];
          if (card?.element) {
            card.element.click();
            log('Clicked card:', index);
          }
        }
        
        // Click play button after short delay
        setTimeout(() => {
          const playBtn = document.querySelector('#game_hand_play');
          if (playBtn && !playBtn.disabled) {
            playBtn.click();
            log('Clicked play button');
          }
        }, 500);
        
        return true;
      }
      
      if (state.phase === 'judging' && state.isJudge) {
        // Select winning submission
        const index = choice.winnerIndex;
        const submissions = document.querySelectorAll('#game_white_cards .card_holder');
        
        if (submissions[index]) {
          submissions[index].click();
          log('Selected winner:', index);
          return true;
        }
      }
      
      return false;
      
    } catch (err) {
      error('Error inputting PYX choice:', err);
      return false;
    }
  }
  
  /**
   * Input choice for All Bad Cards
   */
  function inputAllBadChoice(choice) {
    try {
      const index = choice.cardIndex;
      const cards = document.querySelectorAll('[class*="WhiteCard"]');
      
      if (cards[index]) {
        cards[index].click();
        log('Clicked All Bad card:', index);
        return true;
      }
      
      return false;
      
    } catch (err) {
      error('Error inputting All Bad choice:', err);
      return false;
    }
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  function getGameName() {
    const names = {
      'pyx': 'Cards Against Humanity (PYX)',
      'allbad': 'All Bad Cards',
      'netgames_wavelength': 'Wavelength',
      'netgames_codenames': 'Codenames',
    };
    return names[gameType] || document.title;
  }
  
  function getGameId() {
    // Try to extract game/room ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('game') || urlParams.get('room') || 'unknown';
  }
  
  function formatChoice(choice) {
    if (typeof choice === 'string') return choice;
    if (choice.cardIndex !== undefined) return `Card #${choice.cardIndex + 1}`;
    if (choice.text) return choice.text;
    return JSON.stringify(choice);
  }
  
  function showNotification(title, message) {
    if (typeof GM_notification !== 'undefined') {
      GM_notification({
        title: title,
        text: message,
        timeout: 3000,
      });
    } else {
      log(`[${title}] ${message}`);
    }
  }
  
  // ============================================================================
  // UI OVERLAY
  // ============================================================================
  
  function createUI() {
    const container = document.createElement('div');
    container.id = 'st-bridge-ui';
    container.innerHTML = `
      <style>
        #st-bridge-ui {
          position: fixed;
          top: 10px;
          right: 10px;
          background: rgba(30, 30, 40, 0.95);
          border: 2px solid #6366f1;
          border-radius: 8px;
          padding: 10px 15px;
          font-family: system-ui, sans-serif;
          font-size: 13px;
          color: white;
          z-index: 999999;
          min-width: 180px;
        }
        #st-bridge-ui .status {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #st-bridge-ui .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444;
        }
        #st-bridge-ui .status-dot.connected {
          background: #22c55e;
        }
        #st-bridge-ui .title {
          font-weight: 600;
          margin-bottom: 5px;
        }
        #st-bridge-ui .game-info {
          font-size: 11px;
          opacity: 0.7;
          margin-top: 5px;
        }
      </style>
      <div class="title">🎴 ST Bridge</div>
      <div class="status">
        <div class="status-dot" id="st-bridge-status"></div>
        <span id="st-bridge-status-text">Connecting...</span>
      </div>
      <div class="game-info" id="st-bridge-game">
        Game: ${getGameName()}
      </div>
    `;
    
    document.body.appendChild(container);
    
    // Update status indicator
    setInterval(() => {
      const dot = document.getElementById('st-bridge-status');
      const text = document.getElementById('st-bridge-status-text');
      
      if (dot && text) {
        dot.classList.toggle('connected', isConnected);
        text.textContent = isConnected ? 'Connected' : 'Disconnected';
      }
    }, 1000);
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    log('Initializing SillyTavern Game Bridge');
    log('Detected game type:', gameType);
    
    createUI();
    connect();
  }
  
  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to ensure game UI is loaded
    setTimeout(init, 1000);
  }
  
})();
