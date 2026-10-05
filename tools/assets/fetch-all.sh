#!/usr/bin/env bash
# Downloads the CC0 source packs into assets-src/ and unzips them.
# Needs: bash, curl, python3, unzip. Run from the repository root.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/assets-src"
here="$root/tools/assets"
mkdir -p "$src/quaternius" "$src/kenney"

fetch_itch() { # user game dir
  local dir="$src/quaternius/$3"
  if [ -d "$dir/extracted" ]; then echo "skip $3 (already fetched)"; return; fi
  bash "$here/fetch-itch.sh" "$1" "$2" "$dir/zips"
  mkdir -p "$dir/extracted"
  for z in "$dir"/zips/*; do unzip -q -o "$z" -d "$dir/extracted"; done
}

fetch_kenney() { # slug zip-url
  local dir="$src/kenney/$1"
  if [ -d "$dir/extracted" ]; then echo "skip $1 (already fetched)"; return; fi
  mkdir -p "$dir"
  curl -sSL -o "$dir/pack.zip" "$2"
  mkdir -p "$dir/extracted" && unzip -q -o "$dir/pack.zip" -d "$dir/extracted"
}

# Quaternius (CC0)
fetch_itch quaternius universal-base-characters base-characters
fetch_itch quaternius universal-animation-library animation-library
fetch_itch quaternius modular-character-outfits-fantasy outfits

# Kenney (CC0)
fetch_kenney furniture-kit "https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip"
fetch_kenney car-kit "https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip"
echo "done"
