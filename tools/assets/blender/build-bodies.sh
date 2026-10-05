#!/usr/bin/env bash
# Rigs the realistic CC0 bodies (Blender Foundation Human Base Meshes) to the game skeleton using headless Blender.
# Output: assets-src/generated/body_real_{male,female}.glb, which `pnpm --filter @thelife/asset-tools build` then compresses.
# Needs: curl, tar, unzip. Downloads Blender 4.2 LTS (about 350 MB) and the 50 MB bundle on first run. From the repo root.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
dir="$root/assets-src/blender"
mkdir -p "$dir" "$root/assets-src/generated"
if [ ! -x "$dir/blender-4.2.9-linux-x64/blender" ]; then
  curl -sSL -o "$dir/blender.tar.xz" https://download.blender.org/release/Blender4.2/blender-4.2.9-linux-x64.tar.xz
  tar -xf "$dir/blender.tar.xz" -C "$dir"
fi
if [ ! -f "$dir/hbm/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend" ]; then
  curl -sSL -o "$dir/hbm.zip" https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
  unzip -q -o "$dir/hbm.zip" -d "$dir/hbm"
fi
bundle="$dir/hbm/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend"
quat="$root/assets-src/quaternius/base-characters/extracted/Universal Base Characters[Standard]/Base Characters/Godot - UE"
for sex in male female; do
  Sex="$(tr '[:lower:]' '[:upper:]' <<< "${sex:0:1}")${sex:1}"
  "$dir/blender-4.2.9-linux-x64/blender" -b --python "$root/tools/assets/blender/make_body.py" -- \
    "$bundle" "$quat/Superhero_${Sex}_FullBody.gltf" "$sex" "$root/assets-src/generated/body_real_${sex}.glb" \
    | grep -E "FIT|ARM|WEIGHTS|EXPORTED" || true
done
