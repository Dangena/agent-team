#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BIN_DIR=${1:-"$HOME/.local/bin"}

mkdir -p "$BIN_DIR"
ln -sfn "$ROOT/bin/agent-team" "$BIN_DIR/agent-team"

echo "Installed: $BIN_DIR/agent-team"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add this directory to PATH: $BIN_DIR" ;;
esac
