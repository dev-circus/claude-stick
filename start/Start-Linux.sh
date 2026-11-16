#!/bin/bash
# © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
# Start with:  bash Start-Linux.sh   (file managers often cannot run files from an exFAT stick)
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

case "$(uname -m)" in
  aarch64|arm64) P=linux-arm64 ;;
  *) P=linux-x64 ;;
esac
NODE="$ROOT/runtime/$P/node"

if [ ! -f "$NODE" ]; then
  echo "Für dieses System ($P) ist auf dem Stick nichts vorhanden."
  read -r -p "Zum Schließen Enter drücken ..." _
  exit 1
fi

# Some systems mount sticks without permission to run programs. Then work from a copy.
if ! "$NODE" --version >/dev/null 2>&1; then
  CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/claude-stick"
  mkdir -p "$CACHE" && cp "$NODE" "$CACHE/node" && chmod +x "$CACHE/node"
  NODE="$CACHE/node"
  if ! "$NODE" --version >/dev/null 2>&1; then
    echo "Dieses System erlaubt keine Programme vom Stick und keine Kopie im Home-Ordner."
    read -r -p "Zum Schließen Enter drücken ..." _
    exit 1
  fi
fi

STICK_ROOT="$ROOT" "$NODE" "$ROOT/launcher/menu.mjs"
