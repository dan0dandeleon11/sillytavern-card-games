# 🎴 Card Games Extension for SillyTavern

Play card games like **Uno**, **Cards Against Humanity**, and **Exploding Kittens** with your AI companions!

## ✨ Features

- **Hidden AI Choices**: AI's cards and selections are invisible to the user until revealed
- **Modular Rules Engine**: JSON-based game definitions make it easy to add new games
- **Beautiful UI**: Floating card panel with drag support and animations
- **Smart Integration**: Auto-detects game keywords, injects game context into prompts
- **Per-Chat State**: Game progress saves with your chat

## 📥 Installation

1. Open SillyTavern
2. Go to **Extensions** → **Install Extension**
3. Paste: `https://github.com/dan0dandeleon11/sillytavern-card-games`
4. Click Install

Or manually copy the extension folder to:
```
SillyTavern/data/<user>/extensions/card-games-extension/
```

## 🎮 Quick Start

### Method 1: Natural Language
Just say to your character:
- "Let's play Uno!"
- "Want to play Cards Against Humanity?"
- "How about a game of Exploding Kittens?"

### Method 2: Slash Commands
```
/cardgame start uno
/cardgame start cah
/cardgame end
/cardgame status
```

### Method 3: Settings Panel
Open **Extensions** → **Card Games** and click the quick action buttons.

## 🎯 How It Works

### Hidden State System

The AI's cards and choices are hidden using HTML tag rendering behavior. When the AI responds:

```
*shuffles cards nervously*

<game_state>
<ai_hand>["Red 7", "Blue Skip", "Wild"]</ai_hand>
<ai_selected>Blue Skip</ai_selected>
<ai_reasoning>Blocking their winning streak</ai_reasoning>
</game_state>

"Your move~"
```

**User sees:**
> *shuffles cards nervously*
> 
> "Your move~"

**Extension sees:** Full game state for processing!

### Game Flow

1. **Start Game**: Extension deals cards and shows UI
2. **Your Turn**: Select a card from your hand and click Play
3. **AI Turn**: Extension injects game context, AI responds with hidden choice
4. **Repeat**: Until someone wins!

## 🃏 Supported Games

### Uno
- Full color/number matching rules
- Action cards (Skip, Reverse, +2)
- Wild cards with color selection
- Uno call mechanic

### Cards Against Humanity
- Black and white card system
- Multi-pick cards supported
- Rotating judge system

### Exploding Kittens
- Draw mechanics with Exploding Kittens
- Defuse cards
- Action cards (Coming soon)

## ⚙️ Settings

| Setting | Description |
|---------|-------------|
| Enable Card Games | Turn the extension on/off |
| Panel Position | Left, Right, or Bottom |
| Auto-detect keywords | Start games when you say "let's play..." |
| Show AI reasoning | Debug mode - see AI's strategy |
| Animation Speed | Slow, Normal, or Fast |

## 📝 Adding Custom Games

Create a JSON file in the `games/` folder:

```json
{
  "id": "my_game",
  "name": "My Card Game",
  "deck": {
    "type": "custom",
    "cards": [...]
  },
  "rules": {
    "initialHand": 5,
    "validPlay": {...},
    "winCondition": "player.hand.length === 0"
  }
}
```

See `games/uno.json` for a complete example.

## 🔧 Troubleshooting

### Game not starting?
- Make sure the extension is enabled in settings
- Check that "Auto-detect keywords" is on
- Try using `/cardgame start uno` directly

### AI not responding with game moves?
- The AI needs proper context - make sure you're in an active chat
- Check console for errors (`F12` → Console)
- Try regenerating the AI's response

### UI not appearing?
- Refresh the page
- Check for CSS conflicts with other extensions
- Try changing the panel position

## 🌐 Browser Game Bridge (Advanced)

Connect to online games like **Pretend You're Xyzzy** (CAH) or **netgames.io**!

### Setup

1. **Start the relay server:**
   ```bash
   cd relay/
   npm install
   npm start
   ```

2. **Install the companion userscript:**
   - Install [Tampermonkey](https://www.tampermonkey.net/)
   - Add the script from `companion/st-game-bridge.user.js`

3. **Open your browser game** (PYX, netgames.io, etc.)
   - You'll see a "ST Bridge: Connected" indicator
   - Game state flows to SillyTavern automatically!

### For Complex Games (Werewolf, etc.)

The extension includes an AI summarizer for social deduction games. Configure with Ollama:

```bash
# Start relay with Ollama summarizer
AI_SUMMARIZER_URL=http://localhost:11434/api/generate npm start
```

Supports: Werewolf, Mafia, Secret Hitler, Avalon, Spyfall, Blood on the Clocktower

## 🛣️ Roadmap

- [x] Browser game bridge (PYX, netgames.io)
- [x] AI summarizer for complex games
- [ ] Exploding Kittens full implementation
- [ ] Multiplayer support (friends join via mobile)
- [ ] More games (Blackjack, Poker, Go Fish)
- [ ] Card animations and sound effects
- [ ] Custom deck builder UI

## 🤝 Credits

- **Authors**: Dan & Caleb
- **Inspired by**: RPG Companion, SillyTavern-Tracker
- **License**: AGPL-3.0

## 💖 Support

Found a bug? Have a suggestion? Open an issue on GitHub!

---

Made with ❤️ for the SillyTavern community
