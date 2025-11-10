# Kalyx: The Human-First Terminal Tool

**Kalyx** is a command-line tool that translates your natural language into shell commands. It's powered by local language models via Ollama, so it's fast, free, and private.

## Features

- **Natural Language to Command**: Type what you want to do, and Kalyx will suggest commands.
- **Interactive Selection**: Use your arrow keys to pick the command you want.
- **Command Editing**: Edit commands before you run them.
- **Model Selection**: Choose from a catalog of recommended models, or bring your own.
- **Persistent Model Choice**: Your model selection is saved for future sessions.
- **Safe by Default**: Kalyx will warn you before running potentially destructive commands.
- **Cross-Platform**: Works on Windows, macOS, and Linux.

## Installation

```bash
npm install -g kalyx
```

## Usage

To start, simply run `kalyx`:

```bash
kalyx
```

Or, you can pass your intent directly as an argument:

```bash
kalyx find all files larger than 1GB
```

## Options

- `--model`: Select a model to use. If you don't provide a model name, you'll be prompted to choose from a list of available models.

## How It Works

Kalyx uses a local language model to understand your intent and suggest commands. It then presents you with a list of options, which you can select from, edit, and then execute.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License


This project is licensed under the MIT License.
