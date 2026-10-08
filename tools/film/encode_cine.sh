#!/bin/sh
# Turns the pictures from render_cine.mjs into the sign-in film (mp4 and webm, silent) and a poster still.
#   sh tools/film/encode_cine.sh <frames-dir> <portrait|wide>
set -e
IN="$1"; KIND="${2:-portrait}"
OUT="$(dirname "$0")/../../apps/client/public/assets/film"
mkdir -p "$OUT"
NAME="signin-$KIND"
# a warm grade, a soft vignette, a little film grain, and a fade in and out so the loop does not jump
SECS=$(( $(ls "$IN"/*.jpg | wc -l) / 24 ))
FO=$(( SECS - 1 ))
VF="eq=contrast=1.05:saturation=1.12:gamma=0.97,vignette=PI/6,noise=alls=6:allf=t,fade=t=in:st=0:d=0.7,fade=t=out:st=${FO}:d=0.9,format=yuv420p"
ffmpeg -y -loglevel error -framerate 24 -i "$IN/f%04d.jpg" -vf "$VF" -c:v libx264 -preset slow -crf 27 -movflags +faststart -an "$OUT/$NAME.mp4"
ffmpeg -y -loglevel error -framerate 24 -i "$IN/f%04d.jpg" -vf "$VF" -c:v libvpx-vp9 -crf 43 -b:v 0 -row-mt 1 -an "$OUT/$NAME.webm"
ffmpeg -y -loglevel error -i "$IN/f0110.jpg" -vf "eq=contrast=1.05:saturation=1.12,vignette=PI/6" -q:v 4 "$OUT/$NAME.jpg"
ls -l "$OUT" | grep "$NAME"
