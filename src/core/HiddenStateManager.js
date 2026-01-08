/**
 * HiddenStateManager - Parse hidden game data from AI messages
 * 
 * SillyTavern renders messages as HTML, so custom XML-like tags
 * become invisible to users but remain in the message content.
 * This class extracts that hidden game state.
 */

export class HiddenStateManager {
  constructor(patterns = {}) {
    // Default patterns for parsing game state
    this.patterns = {
      gameState: /<game_state>([\s\S]*?)<\/game_state>/gi,
      aiHand: /<ai_hand>([\s\S]*?)<\/ai_hand>/i,
      aiSelected: /<ai_selected>([\s\S]*?)<\/ai_selected>/i,
      aiReasoning: /<ai_reasoning>([\s\S]*?)<\/ai_reasoning>/i,
      gameAction: /<game_action>([\s\S]*?)<\/game_action>/i,
      gamePhase: /<game_phase>([\s\S]*?)<\/game_phase>/i,
      colorChoice: /<color_choice>([\s\S]*?)<\/color_choice>/i,
      unoCall: /<uno_call>([\s\S]*?)<\/uno_call>/i,
      ...patterns,
    };
    
    // Cache for recently parsed states
    this.cache = new Map();
    this.cacheMaxSize = 50;
  }
  
  /**
   * Parse a message for hidden game state
   * Returns null if no game state found
   */
  parseMessage(messageContent) {
    if (!messageContent || typeof messageContent !== 'string') {
      return null;
    }
    
    // Check cache
    const cacheKey = this.hashString(messageContent);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    // Find game_state block
    const stateMatch = messageContent.match(this.patterns.gameState);
    if (!stateMatch) {
      return null;
    }
    
    const stateContent = stateMatch[1];
    const parsed = this.parseStateContent(stateContent);
    
    // Cache result
    this.cacheResult(cacheKey, parsed);
    
    return parsed;
  }
  
  /**
   * Parse the content inside <game_state> tags
   */
  parseStateContent(content) {
    const result = {};
    
    // Parse AI's hand
    const handMatch = content.match(this.patterns.aiHand);
    if (handMatch) {
      result.aiHand = this.parseArray(handMatch[1]);
    }
    
    // Parse AI's selected card
    const selectedMatch = content.match(this.patterns.aiSelected);
    if (selectedMatch) {
      result.aiSelected = this.cleanValue(selectedMatch[1]);
    }
    
    // Parse AI's reasoning (for debug/display)
    const reasoningMatch = content.match(this.patterns.aiReasoning);
    if (reasoningMatch) {
      result.aiReasoning = this.cleanValue(reasoningMatch[1]);
    }
    
    // Parse game action
    const actionMatch = content.match(this.patterns.gameAction);
    if (actionMatch) {
      result.gameAction = this.cleanValue(actionMatch[1]);
    }
    
    // Parse phase
    const phaseMatch = content.match(this.patterns.gamePhase);
    if (phaseMatch) {
      result.gamePhase = this.cleanValue(phaseMatch[1]);
    }
    
    // Parse color choice (for wild cards)
    const colorMatch = content.match(this.patterns.colorChoice);
    if (colorMatch) {
      result.colorChoice = this.cleanValue(colorMatch[1]).toLowerCase();
    }
    
    // Parse uno call
    const unoMatch = content.match(this.patterns.unoCall);
    if (unoMatch) {
      result.unoCall = this.cleanValue(unoMatch[1]).toLowerCase() === 'true';
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }
  
  /**
   * Parse a value that might be JSON array or comma-separated list
   */
  parseArray(value) {
    const cleaned = this.cleanValue(value);
    
    // Try JSON parse first
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Not valid JSON
    }
    
    // Try comma-separated
    if (cleaned.includes(',')) {
      return cleaned.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Single value
    return cleaned ? [cleaned] : [];
  }
  
  /**
   * Clean a parsed value
   */
  cleanValue(value) {
    if (!value) return '';
    return value
      .trim()
      .replace(/^\[|\]$/g, '')  // Remove array brackets if present
      .replace(/^["']|["']$/g, '')  // Remove quotes
      .trim();
  }
  
  /**
   * Remove game state tags from message for clean display
   * (SillyTavern already hides them, but useful for processing)
   */
  stripGameState(messageContent) {
    return messageContent
      .replace(this.patterns.gameState, '')
      .trim();
  }
  
  /**
   * Generate game state tags for injection into messages
   */
  generateStateTags(state) {
    const parts = [];
    
    if (state.aiHand) {
      parts.push(`<ai_hand>${JSON.stringify(state.aiHand)}</ai_hand>`);
    }
    if (state.aiSelected) {
      parts.push(`<ai_selected>${state.aiSelected}</ai_selected>`);
    }
    if (state.aiReasoning) {
      parts.push(`<ai_reasoning>${state.aiReasoning}</ai_reasoning>`);
    }
    if (state.gameAction) {
      parts.push(`<game_action>${state.gameAction}</game_action>`);
    }
    if (state.colorChoice) {
      parts.push(`<color_choice>${state.colorChoice}</color_choice>`);
    }
    
    if (parts.length === 0) return '';
    
    return `<game_state>\n${parts.join('\n')}\n</game_state>`;
  }
  
  /**
   * Simple string hash for caching
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  
  /**
   * Cache a parsed result
   */
  cacheResult(key, value) {
    // Limit cache size
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }
  
  /**
   * Add custom pattern
   */
  addPattern(name, regex) {
    this.patterns[name] = regex;
  }
  
  /**
   * Parse multiple game state blocks (if AI sent multiple)
   */
  parseAllStates(messageContent) {
    const states = [];
    let match;
    
    const regex = new RegExp(this.patterns.gameState.source, 'gi');
    while ((match = regex.exec(messageContent)) !== null) {
      const parsed = this.parseStateContent(match[1]);
      if (parsed) states.push(parsed);
    }
    
    return states;
  }
  
  /**
   * Validate that parsed state has required fields
   */
  validateState(state, requiredFields = ['aiSelected']) {
    if (!state) return false;
    return requiredFields.every(field => state[field] !== undefined);
  }
}

/**
 * Alternative tag formats the AI might use
 * We support multiple formats to be robust to AI variations
 */
export const AlternativePatterns = {
  // XML-style
  xml: {
    gameState: /<game_state>([\s\S]*?)<\/game_state>/gi,
    aiSelected: /<ai_selected>([\s\S]*?)<\/ai_selected>/i,
  },
  
  // Markdown code block style
  markdown: {
    gameState: /```game_state\n([\s\S]*?)```/gi,
    aiSelected: /\*\*selected\*\*:\s*(.+)/i,
  },
  
  // JSON block style
  json: {
    gameState: /```json:game\n([\s\S]*?)```/gi,
  },
  
  // Comment style (also hidden in HTML)
  comment: {
    gameState: /<!--game_state([\s\S]*?)-->/gi,
  },
};
