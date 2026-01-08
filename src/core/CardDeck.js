/**
 * CardDeck - Generic deck management
 * Handles shuffle, draw, discard, and deck building from game definitions
 */

export class CardDeck {
  constructor(deckConfig) {
    this.config = deckConfig;
    this.cards = [];
    this.drawPile = [];
    
    this.buildDeck();
  }
  
  /**
   * Build deck from configuration
   */
  buildDeck() {
    this.cards = [];
    
    if (this.config.type === 'standard52') {
      this.buildStandard52();
    } else if (this.config.type === 'custom' && this.config.cards) {
      this.buildCustomDeck(this.config.cards);
    }
    
    this.drawPile = [...this.cards];
  }
  
  /**
   * Build standard 52-card deck
   */
  buildStandard52() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suitSymbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
    const suitColors = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
    
    let id = 0;
    for (const suit of suits) {
      for (const value of values) {
        this.cards.push({
          id: `card_${id++}`,
          suit,
          value,
          rank: values.indexOf(value),
          color: suitColors[suit],
          name: `${value}${suitSymbols[suit]}`,
          display: `${value} of ${suit}`,
        });
      }
    }
  }
  
  /**
   * Build custom deck from card definitions
   */
  buildCustomDeck(cardDefs) {
    let instanceId = 0;
    
    for (const def of cardDefs) {
      const count = def.count || 1;
      
      for (let i = 0; i < count; i++) {
        this.cards.push({
          id: `${def.id}_${instanceId++}`,
          templateId: def.id,
          color: def.color,
          value: def.value,
          type: def.type || 'normal',
          name: this.generateCardName(def),
          ...def, // Include any additional properties
        });
      }
    }
  }
  
  /**
   * Generate display name for a card
   */
  generateCardName(def) {
    if (def.name) return def.name;
    
    const parts = [];
    if (def.color) parts.push(this.capitalize(def.color));
    if (def.value) parts.push(this.capitalize(String(def.value)));
    
    return parts.join(' ') || 'Card';
  }
  
  /**
   * Capitalize first letter
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  /**
   * Shuffle the draw pile (Fisher-Yates)
   */
  shuffle() {
    for (let i = this.drawPile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.drawPile[i], this.drawPile[j]] = [this.drawPile[j], this.drawPile[i]];
    }
    return this;
  }
  
  /**
   * Draw cards from the top of the deck
   */
  draw(count = 1) {
    const drawn = [];
    for (let i = 0; i < count && this.drawPile.length > 0; i++) {
      drawn.push(this.drawPile.pop());
    }
    return drawn;
  }
  
  /**
   * Draw from the bottom of the deck
   */
  drawFromBottom(count = 1) {
    const drawn = [];
    for (let i = 0; i < count && this.drawPile.length > 0; i++) {
      drawn.push(this.drawPile.shift());
    }
    return drawn;
  }
  
  /**
   * Add cards to the top of the deck
   */
  addToTop(cards) {
    this.drawPile.push(...cards);
  }
  
  /**
   * Add cards to the bottom of the deck
   */
  addToBottom(cards) {
    this.drawPile.unshift(...cards);
  }
  
  /**
   * Peek at the top card without removing
   */
  peek(count = 1) {
    return this.drawPile.slice(-count).reverse();
  }
  
  /**
   * Get remaining cards count
   */
  remaining() {
    return this.drawPile.length;
  }
  
  /**
   * Check if deck is empty
   */
  isEmpty() {
    return this.drawPile.length === 0;
  }
  
  /**
   * Reset deck to full state
   */
  reset() {
    this.drawPile = [...this.cards];
  }
  
  /**
   * Get all cards in the deck (for display/debugging)
   */
  getAllCards() {
    return [...this.cards];
  }
  
  /**
   * Find a specific card by predicate
   */
  findCard(predicate) {
    return this.drawPile.find(predicate);
  }
  
  /**
   * Remove specific cards from draw pile
   */
  removeCards(cards) {
    const cardIds = new Set(cards.map(c => c.id));
    this.drawPile = this.drawPile.filter(c => !cardIds.has(c.id));
  }
  
  /**
   * Serialize deck state
   */
  serialize() {
    return {
      config: this.config,
      drawPile: this.drawPile.map(c => c.id),
      allCards: this.cards,
    };
  }
  
  /**
   * Restore deck state
   */
  restore(data) {
    this.cards = data.allCards || [];
    
    // Rebuild draw pile from IDs
    const cardMap = new Map(this.cards.map(c => [c.id, c]));
    this.drawPile = (data.drawPile || [])
      .map(id => cardMap.get(id))
      .filter(Boolean);
  }
  
  /**
   * Create a subset deck (for games that don't use all cards)
   */
  static createSubset(fullDeck, filter) {
    const subset = new CardDeck({ type: 'custom', cards: [] });
    subset.cards = fullDeck.cards.filter(filter);
    subset.drawPile = [...subset.cards];
    return subset;
  }
}

/**
 * Pre-built deck configurations
 */
export const DeckPresets = {
  standard52: { type: 'standard52' },
  
  uno: {
    type: 'custom',
    cards: [
      // Number cards (0-9) in 4 colors
      ...['red', 'yellow', 'green', 'blue'].flatMap(color => [
        { id: `${color}_0`, color, value: '0', count: 1 },
        ...['1','2','3','4','5','6','7','8','9'].map(v => 
          ({ id: `${color}_${v}`, color, value: v, count: 2 })
        ),
      ]),
      // Action cards
      ...['red', 'yellow', 'green', 'blue'].flatMap(color => [
        { id: `${color}_skip`, color, value: 'skip', type: 'action', count: 2 },
        { id: `${color}_reverse`, color, value: 'reverse', type: 'action', count: 2 },
        { id: `${color}_draw2`, color, value: 'draw2', type: 'action', count: 2 },
      ]),
      // Wild cards
      { id: 'wild', color: null, value: 'wild', type: 'wild', count: 4 },
      { id: 'wild_draw4', color: null, value: 'wild_draw4', type: 'wild', count: 4 },
    ],
  },
};
