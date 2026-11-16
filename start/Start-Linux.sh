#!/bin/bash
# © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
# Start with:  bash Start-Linux.sh   (file managers often cannot run files from an exFAT stick)
# The first start fetches Node.js for this system, then the menu does the rest.
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

case "$(uname -m)" in
  aarch64|arm64) P=linux-arm64 ;;
  *) P=linux-x64 ;;
esac
NODE="$ROOT/runtime/$P/node"

fail() {
  echo
  echo "$1"
  read -r -p "Zum Schließen Enter drücken ..." _
  exit 1
}

download() { # url file
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$2" "$1"
  else
    return 1
  fi
}

if [ ! -f "$NODE" ]; then
  VER="$(tr -d '[:space:]' < "$ROOT/launcher/NODE_VERSION" 2>/dev/null)"
  [ -n "$VER" ] || fail "Die Datei launcher/NODE_VERSION fehlt. Bitte das Paket neu entpacken."
  FILE="node-$VER-$P.tar.xz"
  BASE="https://nodejs.org/dist/$VER"
  TMP="$(mktemp -d)"
  echo "Erster Start auf diesem System: Node.js wird geladen (einmalig, etwa 30 MB) ..."
  download "$BASE/$FILE" "$TMP/$FILE" || { rm -rf "$TMP"; fail "Das Laden hat nicht geklappt. Ist der Computer online und curl oder wget installiert?"; }
  download "$BASE/SHASUMS256.txt" "$TMP/SHASUMS256.txt" || { rm -rf "$TMP"; fail "Die Prüfsumme konnte nicht geladen werden."; }
  EXPECT="$(grep " $FILE\$" "$TMP/SHASUMS256.txt" | awk '{print $1}')"
  ACTUAL="$(sha256sum "$TMP/$FILE" | awk '{print $1}')"
  if [ -z "$EXPECT" ] || [ "$EXPECT" != "$ACTUAL" ]; then
    rm -rf "$TMP"
    fail "Die Prüfsumme stimmt nicht. Der Download wurde verworfen."
  fi
  if ! { tar -xJf "$TMP/$FILE" -C "$TMP" && mkdir -p "$ROOT/runtime/$P" && cp "$TMP/node-$VER-$P/bin/node" "$NODE" && chmod +x "$NODE"; }; then
    rm -rf "$TMP"
    fail "Das Entpacken hat nicht geklappt (fehlt das Paket xz-utils?)."
  fi
  echo "$VER" > "$ROOT/runtime/$P/VERSION"
  rm -rf "$TMP"
fi

# Some systems mount sticks without permission to run programs. Then work from a copy.
if ! "$NODE" --version >/dev/null 2>&1; then
  CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/claude-stick"
  mkdir -p "$CACHE" && cp "$NODE" "$CACHE/node" && chmod +x "$CACHE/node"
  NODE="$CACHE/node"
  "$NODE" --version >/dev/null 2>&1 || fail "Dieses System erlaubt keine Programme vom Stick und keine Kopie im Home-Ordner."
fi

if [ -n "$STICK_SETUP_ONLY" ]; then
  "$NODE" --version
  exit $?
fi

STICK_ROOT="$ROOT" "$NODE" "$ROOT/launcher/menu.mjs"
