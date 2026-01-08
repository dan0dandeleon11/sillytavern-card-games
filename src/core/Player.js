/**
 * Player - Represents a game participant (user or AI)
 */

export class Player {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.isAI = config.isAI || false;
    this.index = config.index ?? 0;
    
    this.hand = [];
    this.score = 0;
    this.calledUno = false;
    this.connected = true;
    
    // Game-specific data
    this.extraData = {};
  }
  
  /**
   * Get number of cards in hand
   */
  cardCount() {
    return this.hand.length;
  }
  
  /**
   * Check if player has a specific card
   */
  hasCard(cardId) {
    return this.hand.some(c => c.id === cardId);
  }
  
  /**
   * Remove a card from hand by ID
   */
  removeCard(cardId) {
    const index = this.hand.findIndex(c => c.id === cardId);
    if (index >= 0) {
      return this.hand.splice(index, 1)[0];
    }
    return null;
  }
  
  /**
   * Add cards to hand
   */
  addCards(cards) {
    this.hand.push(...cards);
    // Reset uno call when hand changes
    if (this.hand.length > 1) {
      this.calledUno = false;
    }
  }
  
  /**
   * Sort hand by color then value
   */
  sortHand() {
    const colorOrder = { red: 0, yellow: 1, green: 2, blue: 3, null: 4 };
    
    this.hand.sort((a, b) => {
      // Sort by color first
      const colorDiff = (colorOrder[a.color] ?? 99) - (colorOrder[b.color] ?? 99);
      if (colorDiff !== 0) return colorDiff;
      
      // Then by value
      return String(a.value).localeCompare(String(b.value), undefined, { numeric: true });
    });
  }
  
  /**
   * Get cards of a specific color
   */
  getCardsByColor(color) {
    return this.hand.filter(c => c.color === color);
  }
  
  /**
   * Get cards of a specific type
   */
  getCardsByType(type) {
    return this.hand.filter(c => c.type === type);
  }
  
  /**
   * Serialize player state
   */
  serialize() {
    return {
      id: this.id,
      name: this.name,
      isAI: this.isAI,
      index: this.index,
      hand: this.hand,
      score: this.score,
      calledUno: this.calledUno,
      extraData: this.extraData,
    };
  }
  
  /**
   * Create player from serialized data
   */
  static fromData(data) {
    const player = new Player({
      id: data.id,
      name: data.name,
      isAI: data.isAI,
      index: data.index,
    });
    
    player.hand = data.hand || [];
    player.score = data.score || 0;
    player.calledUno = data.calledUno || false;
    player.extraData = data.extraData || {};
    
    return player;
  }
}
