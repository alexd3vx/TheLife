#!/usr/bin/env bash
# usage: itch-fetch.sh <user> <game> <outdir>   (free CC0 packs on itch.io: downloads every upload)
set -euo pipefail
user=$1; game=$2; outdir=$3
base="https://$user.itch.io/$game"
mkdir -p "$outdir"
jar=$(mktemp)
page=$(curl -sL -m 30 -c "$jar" "$base")
csrf=$(echo "$page" | python3 -c "import sys,re;t=sys.stdin.read();m=re.search(r'value=\"([^\"]+)\" name=\"csrf_token\"|csrf_token\" (?:content|value)=\"([^\"]+)\"',t);print(m.group(1) or m.group(2))")
url=$(curl -sL -m 30 -b "$jar" -c "$jar" -X POST -d "csrf_token=$csrf" "$base/download_url" | python3 -c "import sys,json;print(json.load(sys.stdin)['url'])")
curl -sL -m 30 -b "$jar" -c "$jar" "$url" | python3 -c "
import sys,re
t=sys.stdin.read()
for m in re.finditer(r'data-upload_id=\"(\d+)\".*?class=\"name\">([^<]+)<',t,re.S):
    print(m.group(1)+'\t'+m.group(2))
" | while IFS=$'\t' read -r id name; do
  safe=$(echo "$name" | tr -c 'A-Za-z0-9._-' '_')
  fileurl=$(curl -sL -m 30 -b "$jar" -c "$jar" -X POST --data-urlencode "csrf_token=$csrf" -H "X-Requested-With: XMLHttpRequest" "$base/file/$id?source=game_download&as_props=1" | python3 -c "import sys,json;print(json.load(sys.stdin)['url'])")
  curl -sL -m 900 -o "$outdir/$safe" "$fileurl"
  echo "$name -> $(du -h "$outdir/$safe" | cut -f1)"
done
