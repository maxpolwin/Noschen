# Noschen

AI-Powered Research Note-Taking App with live feedback to support academic researchers, consultants, and students.

## Features

- **Local-First Privacy**: All notes stored locally, no cloud sync required
- **AI-Powered Feedback**: Real-time suggestions powered by local LLM (Ollama) or Mistral API
- **Hierarchical Notes**: Organize research with H1 (main topic) and H2 (sub-questions) headings
- **Smart Analysis**:
  - MECE validation (Mutually Exclusive, Collectively Exhaustive)
  - Gap identification
  - Source suggestions
  - Structural improvements
- **Dark Mode**: Clean, distraction-free dark interface
- **Auto-Save**: Never lose your work
- **Keyboard Shortcuts**: Fast workflow with Apple-appropriate shortcuts

## Installation

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Package as desktop app
npm run package
```

## AI Configuration

### Option 1: Ollama (Recommended for Privacy)

1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull llama3.2`
3. Start Ollama (runs automatically on install)
4. In Noschen, go to Settings and select "Ollama (Local)"

Recommended models for M2 MacBook:
- `llama3.2` (default)
- `mistral`
- `phi3`

### Option 2: Mistral API

1. Get an API key from [console.mistral.ai](https://console.mistral.ai)
2. In Noschen, go to Settings and select "Mistral API"
3. Enter your API key

## Usage

### Writing Research Notes

1. **H1 Heading**: Your main research question/topic
   - Type `# ` to create an H1 heading
   - Example: `# Impact of Remote Work on Team Collaboration`

2. **H2 Headings**: Sub-questions or aspects to explore
   - Type `## ` to create an H2 heading
   - Example: `## Communication Patterns`

3. **Content**: Write freely under each heading
   - AI feedback appears after 2 seconds of inactivity
   - Feedback is contextual to your current section

### AI Feedback Types

| Type | Color | Description |
|------|-------|-------------|
| MECE | Purple | Structure completeness and mutual exclusivity |
| Gap | Blue | Missing aspects or perspectives |
| Source | Green | Literature or domain suggestions |
| Structure | Orange | Organization improvements |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd + S` | Force save |
| `Cmd + Enter` | Accept first suggestion |
| `Cmd + Delete` | Reject first suggestion |
| `Cmd + N` | New note (from sidebar) |

### Managing Feedback

- **Accept**: Adds a TODO placeholder in your text
- **Reject**: Hides the suggestion (can view later)
- **Show Rejected**: Review and reconsider rejected suggestions

## Architecture

```
noschen/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.ts     # App entry, IPC handlers
│   │   └── preload.ts  # Context bridge
│   ├── renderer/       # React frontend
│   │   ├── components/ # UI components
│   │   ├── styles/     # CSS styles
│   │   └── App.tsx     # Main app component
│   └── shared/         # Shared types
├── package.json
└── vite.config.ts
```

## Data Storage

Notes are stored in JSON format in your system's app data folder:
- **macOS**: `~/Library/Application Support/noschen/notes/`
- **Windows**: `%APPDATA%/noschen/notes/`
- **Linux**: `~/.config/noschen/notes/`

## License

MIT
