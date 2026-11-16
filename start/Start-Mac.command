#!/bin/bash
# © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
# Double-click to start. Picks the right program for Apple-chip or Intel Macs.
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
  P=darwin-arm64
else
  P=darwin-x64
fi
NODE="$ROOT/runtime/$P/node"

if [ ! -f "$NODE" ]; then
  echo "Für diesen Mac ($P) ist auf dem Stick nichts vorhanden."
  read -r -p "Zum Schließen Enter drücken ..." _
  exit 1
fi

STICK_ROOT="$ROOT" "$NODE" "$ROOT/launcher/menu.mjs"
