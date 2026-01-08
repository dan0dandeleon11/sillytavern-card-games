#!/usr/bin/env node
/**
 * Card Game Bridge Relay Server
 * 
 * A lightweight WebSocket relay that connects:
 * - Browser game companion scripts (PYX, netgames.io, etc.)
 * - SillyTavern card game extension
 * 
 * Run with: node relay-server.js
 * Or: npm start (if package.json is configured)
 * 
 * @author Lei & Caleb
 */

const WebSocket = require('ws');
const http = require('http');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  port: process.env.PORT || 9876,
  host: process.env.HOST || 'localhost',
  heartbeatInterval: 30000,  // 30 seconds
  clientTimeout: 60000,      // 1 minute without heartbeat = disconnect
  maxClients: 10,
  debug: process.env.DEBUG === 'true' || true,
};

// ============================================================================
// STATE
// ============================================================================

const clients = new Map();  // id -> { ws, type, lastSeen, gameId }
let clientIdCounter = 0;

// Client types
const ClientType = {
  SILLYTAVERN: 'sillytavern',
  BROWSER_GAME: 'browser_game',
  UNKNOWN: 'unknown',
};

// ============================================================================
// LOGGING
// ============================================================================

function log(...args) {
  if (CONFIG.debug) {
    console.log(`[${new Date().toISOString()}]`, ...args);
  }
}

function error(...args) {
  console.error(`[${new Date().toISOString()}] ERROR:`, ...args);
}

// ============================================================================
// SERVER SETUP
// ============================================================================

const server = http.createServer((req, res) => {
  // Simple health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      clients: clients.size,
      uptime: process.uptime(),
    }));
    return;
  }
  
  // Info page
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Card Game Bridge Relay</title>
      <style>
        body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
        h1 { color: #6366f1; }
        .status { padding: 10px; background: #f0f0f0; border-radius: 8px; }
        code { background: #e0e0e0; padding: 2px 6px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>🎴 Card Game Bridge Relay</h1>
      <div class="status">
        <p><strong>Status:</strong> Running</p>
        <p><strong>WebSocket:</strong> <code>ws://${CONFIG.host}:${CONFIG.port}</code></p>
        <p><strong>Connected clients:</strong> ${clients.size}</p>
      </div>
      <h2>How to Use</h2>
      <ol>
        <li>Install the SillyTavern Card Games extension</li>
        <li>Install the Tampermonkey userscript for your game site</li>
        <li>Keep this relay server running</li>
        <li>Open your browser game - it will auto-connect!</li>
      </ol>
    </body>
    </html>
  `);
});

const wss = new WebSocket.Server({ server });

// ============================================================================
// WEBSOCKET HANDLERS
// ============================================================================

wss.on('connection', (ws, req) => {
  const clientId = `client_${++clientIdCounter}`;
  const clientIp = req.socket.remoteAddress;
  
  log(`New connection: ${clientId} from ${clientIp}`);
  
  // Check max clients
  if (clients.size >= CONFIG.maxClients) {
    log(`Rejecting ${clientId} - max clients reached`);
    ws.close(1013, 'Max clients reached');
    return;
  }
  
  // Register client
  const client = {
    id: clientId,
    ws: ws,
    type: ClientType.UNKNOWN,
    lastSeen: Date.now(),
    gameId: null,
    ip: clientIp,
  };
  clients.set(clientId, client);
  
  // Send welcome
  sendToClient(client, {
    type: 'welcome',
    data: {
      clientId,
      serverTime: Date.now(),
    },
  });
  
  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(client, message);
    } catch (err) {
      error(`Invalid message from ${clientId}:`, err.message);
    }
  });
  
  // Handle disconnect
  ws.on('close', (code, reason) => {
    log(`Client disconnected: ${clientId} (${code})`);
    clients.delete(clientId);
    
    // Notify paired clients
    broadcastToType(
      client.type === ClientType.SILLYTAVERN ? ClientType.BROWSER_GAME : ClientType.SILLYTAVERN,
      {
        type: 'peer_disconnected',
        data: { clientId, clientType: client.type },
      }
    );
  });
  
  // Handle errors
  ws.on('error', (err) => {
    error(`WebSocket error for ${clientId}:`, err.message);
  });
  
  // Ping/pong for keepalive
  ws.on('pong', () => {
    client.lastSeen = Date.now();
  });
});

// ============================================================================
// MESSAGE ROUTING
// ============================================================================

function handleMessage(client, message) {
  client.lastSeen = Date.now();
  
  log(`Message from ${client.id}:`, message.type);
  
  switch (message.type) {
    // Identification messages
    case 'identify':
      handleIdentify(client, message.data);
      break;
      
    // Game state from browser companion
    case 'game_state':
    case 'game_joined':
    case 'game_ended':
    case 'choice_confirmed':
      // Forward to SillyTavern clients
      broadcastToType(ClientType.SILLYTAVERN, message);
      break;
      
    // Choices from SillyTavern
    case 'make_choice':
    case 'join_game':
    case 'leave_game':
      // Forward to browser game companions
      broadcastToType(ClientType.BROWSER_GAME, message);
      break;
      
    // Heartbeat
    case 'ping':
      sendToClient(client, { type: 'pong', data: { serverTime: Date.now() } });
      break;
      
    // AI summarizer messages (for complex games)
    case 'request_summary':
      handleSummaryRequest(client, message.data);
      break;
      
    case 'summary_response':
      // Forward summary back to requester
      const requester = clients.get(message.data.requesterId);
      if (requester) {
        sendToClient(requester, message);
      }
      break;
      
    default:
      log(`Unknown message type: ${message.type}`);
  }
}

function handleIdentify(client, data) {
  const validTypes = Object.values(ClientType);
  
  if (data.type && validTypes.includes(data.type)) {
    client.type = data.type;
    client.gameId = data.gameId || null;
    
    log(`Client ${client.id} identified as ${client.type}`);
    
    sendToClient(client, {
      type: 'identified',
      data: {
        clientId: client.id,
        clientType: client.type,
        connectedPeers: countClientsByType(
          client.type === ClientType.SILLYTAVERN ? ClientType.BROWSER_GAME : ClientType.SILLYTAVERN
        ),
      },
    });
    
    // Notify peers of new connection
    broadcastToType(
      client.type === ClientType.SILLYTAVERN ? ClientType.BROWSER_GAME : ClientType.SILLYTAVERN,
      {
        type: 'peer_connected',
        data: { clientId: client.id, clientType: client.type },
      }
    );
  }
}

// ============================================================================
// AI SUMMARY SYSTEM (for complex games like Werewolf)
// ============================================================================

/**
 * Handle requests to summarize game state
 * This can use a local cheap AI (like Ollama) or external API
 */
async function handleSummaryRequest(client, data) {
  log('Summary requested for:', data.gameType);
  
  const { gameState, gameType, targetContext } = data;
  
  try {
    // Option 1: Use built-in simple summarizer
    if (!CONFIG.aiSummarizerUrl) {
      const summary = simpleSummarize(gameState, gameType);
      sendToClient(client, {
        type: 'summary_response',
        data: {
          summary,
          gameType,
          method: 'builtin',
        },
      });
      return;
    }
    
    // Option 2: Call external AI summarizer
    const summary = await callAISummarizer(gameState, gameType, targetContext);
    sendToClient(client, {
      type: 'summary_response',
      data: {
        summary,
        gameType,
        method: 'ai',
      },
    });
    
  } catch (err) {
    error('Summary generation failed:', err.message);
    sendToClient(client, {
      type: 'summary_error',
      data: { error: err.message },
    });
  }
}

/**
 * Simple rule-based summarizer for game states
 * Used when no AI summarizer is configured
 */
function simpleSummarize(gameState, gameType) {
  switch (gameType) {
    case 'werewolf':
    case 'mafia':
      return summarizeWerewolf(gameState);
    case 'cah':
    case 'pyx':
      return summarizeCAH(gameState);
    default:
      return summarizeGeneric(gameState);
  }
}

function summarizeWerewolf(state) {
  const lines = [];
  
  lines.push(`[WEREWOLF - ${state.phase || 'Unknown Phase'}]`);
  
  if (state.alivePlayers) {
    lines.push(`Alive: ${state.alivePlayers.join(', ')}`);
  }
  if (state.deadPlayers?.length) {
    lines.push(`Dead: ${state.deadPlayers.join(', ')}`);
  }
  if (state.yourRole) {
    lines.push(`Your role: ${state.yourRole}`);
  }
  if (state.knownRoles) {
    lines.push(`Known info: ${JSON.stringify(state.knownRoles)}`);
  }
  if (state.votes) {
    lines.push(`Current votes: ${JSON.stringify(state.votes)}`);
  }
  if (state.lastNightEvents) {
    lines.push(`Last night: ${state.lastNightEvents}`);
  }
  
  return lines.join('\n');
}

function summarizeCAH(state) {
  const lines = [];
  
  lines.push(`[CAH - Round ${state.round || '?'}]`);
  
  if (state.blackCard) {
    lines.push(`Black card: "${state.blackCard.text}"`);
  }
  if (state.whiteCards?.length) {
    lines.push(`Your cards: ${state.whiteCards.map(c => `"${c.text}"`).join(', ')}`);
  }
  if (state.phase) {
    lines.push(`Phase: ${state.phase}`);
  }
  if (state.judge) {
    lines.push(`Judge: ${state.judge}`);
  }
  
  return lines.join('\n');
}

function summarizeGeneric(state) {
  // Create a readable summary from any game state
  const important = ['phase', 'turn', 'round', 'players', 'yourRole', 'yourHand', 'options'];
  const lines = [];
  
  for (const key of important) {
    if (state[key] !== undefined) {
      const value = typeof state[key] === 'object' 
        ? JSON.stringify(state[key]) 
        : state[key];
      lines.push(`${key}: ${value}`);
    }
  }
  
  return lines.join('\n') || JSON.stringify(state, null, 2);
}

/**
 * Call external AI for more sophisticated summaries
 * Supports Ollama, OpenAI-compatible APIs, etc.
 */
async function callAISummarizer(gameState, gameType, targetContext) {
  const url = CONFIG.aiSummarizerUrl; // e.g., 'http://localhost:11434/api/generate'
  const model = CONFIG.aiSummarizerModel || 'llama3.2:1b'; // Small, fast model
  
  const prompt = `Summarize this ${gameType} game state for an AI player. Be concise but include all strategic information needed to make good decisions.

Game state:
${JSON.stringify(gameState, null, 2)}

${targetContext ? `Additional context: ${targetContext}` : ''}

Provide a clear, actionable summary:`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 200,
      },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`AI API returned ${response.status}`);
  }
  
  const data = await response.json();
  return data.response || data.choices?.[0]?.text || 'Summary unavailable';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function sendToClient(client, message) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

function broadcastToType(type, message) {
  let count = 0;
  for (const [id, client] of clients) {
    if (client.type === type) {
      sendToClient(client, message);
      count++;
    }
  }
  log(`Broadcast to ${count} ${type} clients:`, message.type);
}

function countClientsByType(type) {
  let count = 0;
  for (const [id, client] of clients) {
    if (client.type === type) count++;
  }
  return count;
}

// ============================================================================
// HEARTBEAT & CLEANUP
// ============================================================================

setInterval(() => {
  const now = Date.now();
  
  for (const [id, client] of clients) {
    // Check for timeout
    if (now - client.lastSeen > CONFIG.clientTimeout) {
      log(`Client ${id} timed out`);
      client.ws.close(1000, 'Timeout');
      clients.delete(id);
      continue;
    }
    
    // Send ping
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.ping();
    }
  }
}, CONFIG.heartbeatInterval);

// ============================================================================
// STARTUP
// ============================================================================

server.listen(CONFIG.port, CONFIG.host, () => {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     🎴 Card Game Bridge Relay Server      ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  WebSocket: ws://${CONFIG.host}:${CONFIG.port}`.padEnd(45) + '║');
  console.log(`║  HTTP Info: http://${CONFIG.host}:${CONFIG.port}`.padEnd(45) + '║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log('Waiting for connections...');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  
  for (const [id, client] of clients) {
    client.ws.close(1001, 'Server shutting down');
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
