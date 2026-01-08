/**
 * GameUI - Main user interface for card games
 * Floating panel with hand display, game controls, and card interactions
 */

export class GameUI {
  constructor(options = {}) {
    this.options = {
      position: options.position || 'right',
      onCardSelect: options.onCardSelect || (() => {}),
      onDrawCard: options.onDrawCard || (() => {}),
      onGameAction: options.onGameAction || (() => {}),
      onMenuAction: options.onMenuAction || (() => {}),
    };
    
    this.panel = null;
    this.isMinimized = false;
    this.isVisible = false;
    this.selectedCard = null;
    this.currentState = null;
    
    this.createPanel();
    this.setupDraggable();
    this.hide(); // Start hidden
  }
  
  /**
   * Create the main panel structure
   */
  createPanel() {
    this.panel = document.createElement('div');
    this.panel.id = 'card-game-panel';
    this.panel.className = `card-game-panel position-${this.options.position}`;
    
    this.panel.innerHTML = `
      <div class="cg-header">
        <div class="cg-title">
          <span class="cg-game-icon">🎴</span>
          <span class="cg-game-name">Card Game</span>
        </div>
        <div class="cg-controls">
          <button class="cg-btn cg-btn-icon" data-action="menu" title="Game Menu">
            <span>☰</span>
          </button>
          <button class="cg-btn cg-btn-icon" data-action="minimize" title="Minimize">
            <span>−</span>
          </button>
        </div>
      </div>
      
      <div class="cg-body">
        <div class="cg-game-info">
          <div class="cg-turn-indicator">
            <span class="cg-turn-label">Turn</span>
            <span class="cg-turn-number">1</span>
          </div>
          <div class="cg-deck-info">
            <span class="cg-deck-count">52</span>
            <span class="cg-deck-label">cards left</span>
          </div>
        </div>
        
        <div class="cg-play-area">
          <div class="cg-discard-pile">
            <div class="cg-card cg-top-card" data-card="">
              <span class="cg-card-content">?</span>
            </div>
            <span class="cg-pile-label">Discard</span>
          </div>
          
          <div class="cg-deck-pile" data-action="draw">
            <div class="cg-card cg-deck-back">
              <span class="cg-card-content">🎴</span>
            </div>
            <span class="cg-pile-label">Draw</span>
          </div>
        </div>
        
        <div class="cg-opponent-info">
          <span class="cg-opponent-name">Opponent</span>
          <span class="cg-opponent-cards">7 cards</span>
        </div>
        
        <div class="cg-divider"></div>
        
        <div class="cg-player-section">
          <div class="cg-player-label">Your Hand</div>
          <div class="cg-hand" id="cg-player-hand">
            <!-- Cards will be rendered here -->
          </div>
        </div>
        
        <div class="cg-action-buttons">
          <button class="cg-btn cg-btn-primary" data-action="play" disabled>
            Play Card
          </button>
          <button class="cg-btn cg-btn-secondary" data-action="draw">
            Draw
          </button>
          <button class="cg-btn cg-btn-special" data-action="uno" style="display: none;">
            UNO!
          </button>
        </div>
      </div>
      
      <div class="cg-status-bar">
        <span class="cg-status-text">Your turn</span>
      </div>
      
      <div class="cg-ai-thinking" style="display: none;">
        <span class="cg-thinking-spinner">⏳</span>
        <span class="cg-thinking-text">Thinking...</span>
      </div>
    `;
    
    // Add event listeners
    this.panel.addEventListener('click', (e) => this.handleClick(e));
    
    // Append to body
    document.body.appendChild(this.panel);
  }
  
  /**
   * Setup draggable functionality
   */
  setupDraggable() {
    const header = this.panel.querySelector('.cg-header');
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.cg-btn')) return; // Don't drag when clicking buttons
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = this.panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      header.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      this.panel.style.left = `${startLeft + dx}px`;
      this.panel.style.top = `${startTop + dy}px`;
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
      header.style.cursor = 'grab';
    });
  }
  
  /**
   * Handle click events
   */
  handleClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    const cardElement = e.target.closest('.cg-hand-card');
    
    if (cardElement && !cardElement.classList.contains('invalid')) {
      this.selectCard(cardElement);
      return;
    }
    
    switch (action) {
      case 'play':
        if (this.selectedCard) {
          this.options.onCardSelect(this.selectedCard);
          this.clearSelection();
        }
        break;
      case 'draw':
        this.options.onDrawCard();
        break;
      case 'menu':
        this.showMenu();
        break;
      case 'minimize':
        this.toggleMinimize();
        break;
      case 'uno':
        this.options.onGameAction({ type: 'uno', playerId: 'user' });
        break;
    }
  }
  
  /**
   * Select a card in hand
   */
  selectCard(cardElement) {
    // Deselect previous
    this.panel.querySelectorAll('.cg-hand-card.selected').forEach(el => {
      el.classList.remove('selected');
    });
    
    // Select new
    cardElement.classList.add('selected');
    this.selectedCard = JSON.parse(cardElement.dataset.card);
    
    // Enable play button
    this.panel.querySelector('[data-action="play"]').disabled = false;
  }
  
  /**
   * Clear card selection
   */
  clearSelection() {
    this.panel.querySelectorAll('.cg-hand-card.selected').forEach(el => {
      el.classList.remove('selected');
    });
    this.selectedCard = null;
    this.panel.querySelector('[data-action="play"]').disabled = true;
  }
  
  /**
   * Update UI from game state
   */
  updateFromState(state) {
    this.currentState = state;
    
    // Update game name
    this.panel.querySelector('.cg-game-name').textContent = state.gameName || 'Card Game';
    
    // Update turn info
    this.panel.querySelector('.cg-turn-number').textContent = state.turnNumber;
    this.panel.querySelector('.cg-deck-count').textContent = state.deckCount;
    
    // Update top card
    const topCardEl = this.panel.querySelector('.cg-top-card');
    if (state.topCard) {
      this.renderCard(topCardEl, state.topCard, false);
    }
    
    // Update opponent info
    this.panel.querySelector('.cg-opponent-cards').textContent = `${state.aiCardCount} cards`;
    
    // Render player hand
    this.renderHand(state.userHand, state.validPlays);
    
    // Update status
    this.updateStatus(state);
    
    // Show/hide Uno button
    const unoBtn = this.panel.querySelector('[data-action="uno"]');
    if (state.gameType === 'uno' && state.userHand?.length === 2) {
      unoBtn.style.display = 'inline-block';
    } else {
      unoBtn.style.display = 'none';
    }
  }
  
  /**
   * Render player's hand
   */
  renderHand(hand, validPlays = []) {
    const handContainer = this.panel.querySelector('#cg-player-hand');
    handContainer.innerHTML = '';
    
    if (!hand || hand.length === 0) {
      handContainer.innerHTML = '<div class="cg-empty-hand">No cards</div>';
      return;
    }
    
    const validSet = new Set(validPlays);
    
    hand.forEach((card, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'cg-hand-card';
      cardEl.dataset.card = JSON.stringify(card);
      cardEl.dataset.index = index;
      
      // Check if valid play
      const cardName = card.name || `${card.color || ''} ${card.value || ''}`.trim();
      const isValid = validSet.has(cardName) || validPlays.length === 0;
      
      if (!isValid) {
        cardEl.classList.add('invalid');
      }
      
      this.renderCard(cardEl, card, true);
      handContainer.appendChild(cardEl);
    });
  }
  
  /**
   * Render a single card
   */
  renderCard(element, card, inHand = false) {
    const color = card.color || 'wild';
    const value = card.value || '?';
    const isWild = card.type === 'wild';
    
    element.className = element.className.replace(/\bcard-color-\w+\b/g, '');
    element.classList.add(`card-color-${color}`);
    
    if (isWild) {
      element.classList.add('card-wild');
    }
    
    // Card content
    let displayValue = value;
    if (value === 'skip') displayValue = '⊘';
    else if (value === 'reverse') displayValue = '⟲';
    else if (value === 'draw2') displayValue = '+2';
    else if (value === 'wild') displayValue = '★';
    else if (value === 'wild_draw4') displayValue = '+4';
    
    element.innerHTML = `
      <span class="cg-card-value">${displayValue}</span>
      ${inHand ? `<span class="cg-card-color-bar"></span>` : ''}
    `;
    
    element.title = card.name || `${card.color || 'Wild'} ${card.value}`;
  }
  
  /**
   * Update status bar
   */
  updateStatus(state) {
    const statusEl = this.panel.querySelector('.cg-status-text');
    const isUserTurn = state.currentPlayer === 'user';
    
    if (state.winner) {
      statusEl.textContent = state.winner === 'user' ? '🎉 You won!' : '😢 You lost';
    } else if (isUserTurn) {
      statusEl.textContent = 'Your turn - select a card';
      this.panel.classList.add('user-turn');
      this.panel.classList.remove('ai-turn');
    } else {
      statusEl.textContent = 'Waiting for opponent...';
      this.panel.classList.remove('user-turn');
      this.panel.classList.add('ai-turn');
    }
  }
  
  /**
   * Show waiting for AI indicator
   */
  setWaitingForAI(waiting) {
    const thinkingEl = this.panel.querySelector('.cg-ai-thinking');
    thinkingEl.style.display = waiting ? 'flex' : 'none';
  }
  
  /**
   * Show AI's reasoning (debug mode)
   */
  showAIThought(reasoning) {
    // Could show a toast or temporary overlay
    console.log('[CardGames] AI reasoning:', reasoning);
  }
  
  /**
   * Highlight that it's user's turn
   */
  highlightUserTurn() {
    this.panel.classList.add('pulse-highlight');
    setTimeout(() => this.panel.classList.remove('pulse-highlight'), 1000);
  }
  
  /**
   * Show game end state
   */
  showGameEnd(result) {
    this.updateStatus({ winner: result.winner });
    
    // Could show a modal or special animation
    const isWin = result.winner === 'user';
    toastr.info(
      isWin ? 'Congratulations! 🎉' : 'Better luck next time!',
      'Game Over'
    );
  }
  
  /**
   * Show game menu
   */
  showMenu() {
    // Simple menu - could be enhanced with proper dropdown
    const actions = [
      { label: 'New Game', action: 'new_game' },
      { label: 'End Game', action: 'end_game' },
      { label: 'Settings', action: 'settings' },
    ];
    
    const choice = prompt(
      'Game Menu:\n1. New Game\n2. End Game\n3. Settings\n\nEnter number:'
    );
    
    if (choice === '1') this.options.onMenuAction('new_game');
    else if (choice === '2') this.options.onMenuAction('end_game');
    else if (choice === '3') this.options.onMenuAction('settings');
  }
  
  /**
   * Toggle minimize state
   */
  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.panel.classList.toggle('minimized', this.isMinimized);
  }
  
  /**
   * Show the panel
   */
  show() {
    this.panel.style.display = 'flex';
    this.isVisible = true;
  }
  
  /**
   * Hide the panel
   */
  hide() {
    this.panel.style.display = 'none';
    this.isVisible = false;
  }
  
  /**
   * Toggle panel visibility
   */
  toggle() {
    if (this.isVisible) this.hide();
    else this.show();
  }
  
  /**
   * Destroy the UI
   */
  destroy() {
    this.panel?.remove();
    this.panel = null;
  }
}
