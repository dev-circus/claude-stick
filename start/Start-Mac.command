#!/bin/bash
# © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
# Double-click to start. The first start fetches Node.js for this Mac, then the menu does the rest.
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
  P=darwin-arm64
else
  P=darwin-x64
fi
NODE="$ROOT/runtime/$P/node"

fail() {
  echo
  echo "$1"
  read -r -p "Zum Schließen Enter drücken ..." _
  exit 1
}

if [ ! -f "$NODE" ]; then
  VER="$(tr -d '[:space:]' < "$ROOT/launcher/NODE_VERSION" 2>/dev/null)"
  [ -n "$VER" ] || fail "Die Datei launcher/NODE_VERSION fehlt. Bitte das Paket neu entpacken."
  FILE="node-$VER-$P.tar.gz"
  BASE="https://nodejs.org/dist/$VER"
  TMP="$(mktemp -d)"
  echo "Erster Start auf diesem Mac: Node.js wird geladen (einmalig, etwa 45 MB) ..."
  curl -fL --progress-bar -o "$TMP/$FILE" "$BASE/$FILE" || { rm -rf "$TMP"; fail "Das Laden hat nicht geklappt. Ist der Computer online?"; }
  curl -fsSL -o "$TMP/SHASUMS256.txt" "$BASE/SHASUMS256.txt" || { rm -rf "$TMP"; fail "Die Prüfsumme konnte nicht geladen werden."; }
  EXPECT="$(grep " $FILE\$" "$TMP/SHASUMS256.txt" | awk '{print $1}')"
  ACTUAL="$(shasum -a 256 "$TMP/$FILE" | awk '{print $1}')"
  if [ -z "$EXPECT" ] || [ "$EXPECT" != "$ACTUAL" ]; then
    rm -rf "$TMP"
    fail "Die Prüfsumme stimmt nicht. Der Download wurde verworfen."
  fi
  if ! { tar -xzf "$TMP/$FILE" -C "$TMP" && mkdir -p "$ROOT/runtime/$P" && cp "$TMP/node-$VER-$P/bin/node" "$NODE" && chmod +x "$NODE"; }; then
    rm -rf "$TMP"
    fail "Das Entpacken hat nicht geklappt."
  fi
  echo "$VER" > "$ROOT/runtime/$P/VERSION"
  rm -rf "$TMP"
fi

if [ -n "$STICK_SETUP_ONLY" ]; then
  "$NODE" --version
  exit $?
fi

STICK_ROOT="$ROOT" "$NODE" "$ROOT/launcher/menu.mjs"
