/**
 * GameSummarizer - AI-powered game state summarization
 * 
 * For complex games like Werewolf, Mafia, Secret Hitler, etc.
 * where game state is too complex to just pass raw data to the main AI.
 * 
 * Uses cheap, fast models (Ollama with small LLMs, or Claude Haiku)
 * to create concise summaries that the main roleplay AI can understand.
 * 
 * @author Lei & Caleb
 */

export class GameSummarizer {
  constructor(options = {}) {
    this.options = {
      // API configuration
      provider: options.provider || 'ollama', // 'ollama', 'anthropic', 'openai'
      apiUrl: options.apiUrl || 'http://localhost:11434/api/generate',
      apiKey: options.apiKey || null,
      model: options.model || 'llama3.2:1b', // Fast and cheap!
      
      // Behavior
      maxTokens: options.maxTokens || 300,
      temperature: options.temperature || 0.3,
      cacheEnabled: options.cacheEnabled ?? true,
      cacheTTL: options.cacheTTL || 30000, // 30 seconds
      
      // Callbacks
      onSummaryGenerated: options.onSummaryGenerated || (() => {}),
      onError: options.onError || (() => {}),
    };
    
    // Cache for recent summaries
    this.cache = new Map();
    
    // Game-specific prompt templates
    this.templates = this.initializeTemplates();
  }
  
  /**
   * Generate a summary for the given game state
   */
  async summarize(gameState, gameType, context = {}) {
    // Check cache
    const cacheKey = this.getCacheKey(gameState, gameType);
    if (this.options.cacheEnabled && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.options.cacheTTL) {
        return cached.summary;
      }
    }
    
    try {
      // Build the prompt
      const prompt = this.buildPrompt(gameState, gameType, context);
      
      // Call the AI
      const summary = await this.callAI(prompt);
      
      // Cache the result
      if (this.options.cacheEnabled) {
        this.cache.set(cacheKey, {
          summary,
          timestamp: Date.now(),
        });
      }
      
      // Notify
      this.options.onSummaryGenerated(summary, gameType);
      
      return summary;
      
    } catch (error) {
      console.error('[GameSummarizer] Error:', error);
      this.options.onError(error);
      
      // Fallback to simple summary
      return this.simpleSummary(gameState, gameType);
    }
  }
  
  /**
   * Build prompt for the summarizer AI
   */
  buildPrompt(gameState, gameType, context) {
    const template = this.templates[gameType] || this.templates.default;
    
    let prompt = template.system + '\n\n';
    prompt += template.instruction + '\n\n';
    prompt += `GAME STATE:\n${JSON.stringify(gameState, null, 2)}\n\n`;
    
    if (context.characterName) {
      prompt += `You are summarizing for a character named "${context.characterName}".\n`;
    }
    if (context.playerRole) {
      prompt += `The player's role is: ${context.playerRole}\n`;
    }
    if (context.additionalContext) {
      prompt += `Additional context: ${context.additionalContext}\n`;
    }
    
    prompt += '\nSUMMARY:';
    
    return prompt;
  }
  
  /**
   * Call the AI provider
   */
  async callAI(prompt) {
    switch (this.options.provider) {
      case 'ollama':
        return this.callOllama(prompt);
      case 'anthropic':
        return this.callAnthropic(prompt);
      case 'openai':
        return this.callOpenAI(prompt);
      default:
        throw new Error(`Unknown provider: ${this.options.provider}`);
    }
  }
  
  /**
   * Call Ollama API (local, free)
   */
  async callOllama(prompt) {
    const response = await fetch(this.options.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.options.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: this.options.temperature,
          num_predict: this.options.maxTokens,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.response.trim();
  }
  
  /**
   * Call Anthropic API (Claude Haiku - cheap and fast)
   */
  async callAnthropic(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.options.model || 'claude-3-haiku-20240307',
        max_tokens: this.options.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.content[0].text.trim();
  }
  
  /**
   * Call OpenAI-compatible API
   */
  async callOpenAI(prompt) {
    const response = await fetch(this.options.apiUrl || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model || 'gpt-3.5-turbo',
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }
  
  /**
   * Simple rule-based summary (fallback)
   */
  simpleSummary(gameState, gameType) {
    const handlers = {
      werewolf: this.summarizeWerewolf,
      mafia: this.summarizeWerewolf, // Same structure
      secret_hitler: this.summarizeSecretHitler,
      avalon: this.summarizeAvalon,
      spyfall: this.summarizeSpyfall,
      blood_on_clocktower: this.summarizeBloodOnClocktower,
    };
    
    const handler = handlers[gameType] || this.summarizeGeneric;
    return handler.call(this, gameState);
  }
  
  /**
   * Werewolf/Mafia summary
   */
  summarizeWerewolf(state) {
    const lines = [];
    lines.push(`=== WEREWOLF - ${state.phase?.toUpperCase() || 'UNKNOWN PHASE'} ===`);
    
    if (state.dayNumber) lines.push(`Day ${state.dayNumber}`);
    if (state.yourRole) lines.push(`YOUR ROLE: ${state.yourRole} (${this.getRoleDescription(state.yourRole)})`);
    
    if (state.alivePlayers?.length) {
      lines.push(`\nALIVE (${state.alivePlayers.length}): ${state.alivePlayers.join(', ')}`);
    }
    if (state.deadPlayers?.length) {
      lines.push(`DEAD: ${state.deadPlayers.map(p => `${p.name} (${p.role || '?'})`).join(', ')}`);
    }
    
    if (state.knownInformation) {
      lines.push(`\nKNOWN INFO:`);
      for (const [player, info] of Object.entries(state.knownInformation)) {
        lines.push(`  - ${player}: ${info}`);
      }
    }
    
    if (state.currentVotes) {
      lines.push(`\nCURRENT VOTES:`);
      for (const [voter, target] of Object.entries(state.currentVotes)) {
        lines.push(`  ${voter} → ${target}`);
      }
    }
    
    if (state.lastNightEvents) {
      lines.push(`\nLAST NIGHT: ${state.lastNightEvents}`);
    }
    
    if (state.availableActions?.length) {
      lines.push(`\nYOU CAN: ${state.availableActions.join(', ')}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Secret Hitler summary
   */
  summarizeSecretHitler(state) {
    const lines = [];
    lines.push(`=== SECRET HITLER ===`);
    
    if (state.yourRole) {
      lines.push(`YOUR ROLE: ${state.yourRole}`);
      if (state.yourRole === 'fascist' && state.knownFascists) {
        lines.push(`KNOWN FASCISTS: ${state.knownFascists.join(', ')}`);
      }
      if (state.yourRole === 'fascist' && state.hitler) {
        lines.push(`HITLER: ${state.hitler}`);
      }
    }
    
    lines.push(`\nPOLICY TRACK:`);
    lines.push(`  Liberal: ${state.liberalPolicies || 0}/5`);
    lines.push(`  Fascist: ${state.fascistPolicies || 0}/6`);
    
    if (state.electionTracker !== undefined) {
      lines.push(`  Election tracker: ${state.electionTracker}/3`);
    }
    
    if (state.president) lines.push(`\nPRESIDENT: ${state.president}`);
    if (state.chancellor) lines.push(`CHANCELLOR: ${state.chancellor}`);
    if (state.previousGovernment) {
      lines.push(`PREV GOV (ineligible): ${state.previousGovernment.join(', ')}`);
    }
    
    if (state.deadPlayers?.length) {
      lines.push(`\nDEAD: ${state.deadPlayers.join(', ')}`);
    }
    
    if (state.investigations) {
      lines.push(`\nINVESTIGATIONS:`);
      for (const inv of state.investigations) {
        lines.push(`  ${inv.investigator} checked ${inv.target}: ${inv.result}`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Avalon summary
   */
  summarizeAvalon(state) {
    const lines = [];
    lines.push(`=== AVALON - Mission ${state.currentMission || '?'} ===`);
    
    if (state.yourRole) {
      lines.push(`YOUR ROLE: ${state.yourRole}`);
      if (state.knownEvil) {
        lines.push(`KNOWN EVIL: ${state.knownEvil.join(', ')}`);
      }
      if (state.knownMerlin) {
        lines.push(`MERLIN: ${state.knownMerlin}`);
      }
    }
    
    lines.push(`\nMISSION RESULTS: ${(state.missionResults || []).map(r => r ? '✓' : '✗').join(' ')}`);
    lines.push(`Good needs: ${3 - (state.goodWins || 0)} more wins`);
    lines.push(`Evil needs: ${3 - (state.evilWins || 0)} more wins`);
    
    if (state.currentTeam) {
      lines.push(`\nPROPOSED TEAM: ${state.currentTeam.join(', ')}`);
    }
    if (state.voteTrack !== undefined) {
      lines.push(`Vote track: ${state.voteTrack}/5 (5th auto-passes)`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Spyfall summary
   */
  summarizeSpyfall(state) {
    const lines = [];
    lines.push(`=== SPYFALL ===`);
    
    if (state.isSpy) {
      lines.push(`YOU ARE THE SPY!`);
      lines.push(`Possible locations: ${state.possibleLocations?.join(', ') || 'Unknown'}`);
    } else {
      lines.push(`LOCATION: ${state.location}`);
      lines.push(`YOUR ROLE: ${state.yourRole}`);
    }
    
    lines.push(`\nPLAYERS: ${state.players?.join(', ')}`);
    
    if (state.questionsAsked?.length) {
      lines.push(`\nRECENT Q&A:`);
      for (const qa of state.questionsAsked.slice(-5)) {
        lines.push(`  ${qa.asker} → ${qa.answerer}: "${qa.question}" / "${qa.answer}"`);
      }
    }
    
    if (state.suspicions) {
      lines.push(`\nSUSPICIONS: ${JSON.stringify(state.suspicions)}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Blood on the Clocktower summary
   */
  summarizeBloodOnClocktower(state) {
    const lines = [];
    lines.push(`=== BLOOD ON THE CLOCKTOWER - ${state.phase || 'Unknown'} ===`);
    
    if (state.yourRole) {
      lines.push(`YOUR ROLE: ${state.yourRole}`);
      lines.push(`ALIGNMENT: ${state.yourAlignment}`);
      if (state.yourAbility) {
        lines.push(`ABILITY: ${state.yourAbility}`);
      }
    }
    
    if (state.alivePlayers) {
      lines.push(`\nALIVE: ${state.alivePlayers.join(', ')}`);
    }
    if (state.deadPlayers) {
      lines.push(`DEAD: ${state.deadPlayers.map(p => 
        `${p.name}${p.usedGhostVote ? ' (voted)' : ' (can vote)'}`
      ).join(', ')}`);
    }
    
    if (state.nominations) {
      lines.push(`\nNOMINATIONS TODAY:`);
      for (const nom of state.nominations) {
        lines.push(`  ${nom.nominator} nominated ${nom.target}: ${nom.votes} votes`);
      }
    }
    
    if (state.nightInformation) {
      lines.push(`\nNIGHT INFO: ${state.nightInformation}`);
    }
    
    if (state.claims) {
      lines.push(`\nCLAIMS:`);
      for (const [player, claim] of Object.entries(state.claims)) {
        lines.push(`  ${player}: ${claim}`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generic summary for unknown games
   */
  summarizeGeneric(state) {
    const lines = [`=== GAME STATE ===`];
    
    // Extract important-looking keys
    const importantKeys = [
      'phase', 'round', 'turn', 'yourRole', 'yourHand', 
      'players', 'alivePlayers', 'deadPlayers',
      'options', 'availableActions', 'currentPlayer'
    ];
    
    for (const key of importantKeys) {
      if (state[key] !== undefined) {
        const value = typeof state[key] === 'object' 
          ? JSON.stringify(state[key]) 
          : state[key];
        lines.push(`${key}: ${value}`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Get role description for Werewolf
   */
  getRoleDescription(role) {
    const descriptions = {
      'werewolf': 'Kill villagers at night',
      'villager': 'Find and eliminate werewolves',
      'seer': 'Check one player each night',
      'doctor': 'Protect one player each night',
      'hunter': 'Kill someone when you die',
      'witch': 'One heal, one kill potion',
      'cupid': 'Link two lovers',
      'bodyguard': 'Protect at cost of your life',
      'mayor': 'Vote counts double',
    };
    return descriptions[role.toLowerCase()] || 'Unknown role';
  }
  
  /**
   * Initialize prompt templates
   */
  initializeTemplates() {
    return {
      default: {
        system: 'You are a game state summarizer. Create concise, actionable summaries for AI players.',
        instruction: 'Summarize the following game state. Focus on: current situation, what the player knows, and what actions they can take. Be brief but complete.',
      },
      
      werewolf: {
        system: 'You are summarizing Werewolf/Mafia game state for an AI player. Focus on deduction and social dynamics.',
        instruction: `Summarize for strategic play:
1. Player's role and win condition
2. Who is alive/dead and known roles
3. Current suspicions and voting patterns
4. What night actions occurred
5. Recommended strategy

Keep it under 200 words.`,
      },
      
      secret_hitler: {
        system: 'You are summarizing Secret Hitler game state. Focus on trust, voting patterns, and policy tracking.',
        instruction: `Summarize for strategic play:
1. Player's role and team
2. Policy track progress
3. Government history and patterns
4. Player trust levels based on actions
5. Strategic recommendations

Keep it under 200 words.`,
      },
      
      avalon: {
        system: 'You are summarizing Avalon game state. Focus on mission outcomes and player behavior.',
        instruction: `Summarize for strategic play:
1. Player's role and knowledge
2. Mission history and fail patterns
3. Team composition voting patterns
4. Who might be evil based on behavior
5. Strategic recommendations

Keep it under 200 words.`,
      },
      
      spyfall: {
        system: 'You are summarizing Spyfall game state. Focus on question patterns and suspicions.',
        instruction: `Summarize for strategic play:
1. Whether player is spy or not
2. Location (if known) or location clues gathered
3. Suspicious question/answer patterns
4. Who seems to know or not know the location
5. Recommended questions or deflections

Keep it under 150 words.`,
      },
    };
  }
  
  /**
   * Generate cache key
   */
  getCacheKey(gameState, gameType) {
    const stateString = JSON.stringify(gameState);
    let hash = 0;
    for (let i = 0; i < stateString.length; i++) {
      const char = stateString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${gameType}_${hash}`;
  }
  
  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }
  
  /**
   * Add custom template
   */
  addTemplate(gameType, template) {
    this.templates[gameType] = template;
  }
}

/**
 * Supported social deduction games
 */
export const SocialDeductionGames = {
  WEREWOLF: 'werewolf',
  MAFIA: 'mafia',
  SECRET_HITLER: 'secret_hitler',
  AVALON: 'avalon',
  THE_RESISTANCE: 'resistance',
  SPYFALL: 'spyfall',
  BLOOD_ON_CLOCKTOWER: 'blood_on_clocktower',
  ONE_NIGHT: 'one_night_werewolf',
  COUP: 'coup',
  LOVE_LETTER: 'love_letter',
};
