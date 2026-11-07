#!/usr/bin/env bash
set -euo pipefail

command -v sips >/dev/null || { echo 'prepare-macos-icon.sh must run on macOS.' >&2; exit 1; }
command -v iconutil >/dev/null || { echo 'macOS iconutil is unavailable.' >&2; exit 1; }
test -f public/icon-512.png || { echo 'Missing public/icon-512.png.' >&2; exit 1; }

ICON_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/banksetu-icon.XXXXXX")
trap 'rm -rf "$ICON_ROOT"' EXIT
ICONSET="$ICON_ROOT/BankSetu.iconset"
mkdir -p "$ICONSET" build
sips -z 16 16 public/icon-512.png --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32 public/icon-512.png --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 public/icon-512.png --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64 public/icon-512.png --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 public/icon-512.png --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 public/icon-512.png --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 public/icon-512.png --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 public/icon-512.png --out "$ICONSET/icon_256x256@2x.png" >/dev/null
cp public/icon-512.png "$ICONSET/icon_512x512.png"
sips -z 1024 1024 public/icon-512.png --out "$ICONSET/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET" -o build/icon.icns
