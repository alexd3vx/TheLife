#!/bin/sh
# Turns the pictures from render_arrival.mjs into the phone version of the arrival film's first beats.
#   sh tools/film/encode_arrival.sh <frames-dir> <tier>
set -e
IN="$1"; TIER="$2"
OUT="$(dirname "$0")/../../apps/client/public/assets/film"
mkdir -p "$OUT"
VF="eq=contrast=1.05:saturation=1.12:gamma=0.97,vignette=PI/6,noise=alls=5:allf=t,fade=t=in:st=0:d=0.5,format=yuv420p"
ffmpeg -y -loglevel error -framerate 24 -i "$IN/f%04d.jpg" -vf "$VF" -c:v libx264 -preset slow -crf 28 -movflags +faststart -an "$OUT/arrival-$TIER.mp4"
ffmpeg -y -loglevel error -framerate 24 -i "$IN/f%04d.jpg" -vf "$VF" -c:v libvpx-vp9 -crf 43 -b:v 0 -row-mt 1 -an "$OUT/arrival-$TIER.webm"
[ -f "$IN/plate.jpg" ] && cp "$IN/plate.jpg" "$OUT/arrival-plate.jpg"
ls -l "$OUT" | grep arrival
