#!/usr/bin/env bash
# delete_even_and_renumber.sh
# Run this inside the folder containing files like 00001.png, 00002.png, ...

set -euo pipefail
shopt -s nullglob

# 1) Collect zero-padded PNGs (e.g., 00001.png). Lexicographic == numeric because of padding.
files=( [0-9][0-9][0-9][0-9][0-9].png )

if (( ${#files[@]} == 0 )); then
  echo "No files matching 00001.png pattern found."
  exit 0
fi

echo "Found ${#files[@]} files. Deleting even-numbered ones..."

# 2) Delete even-numbered files.
for f in "${files[@]}"; do
  base="${f%.png}"           # e.g., 00012
  # Force base-10 to avoid octal interpretation of leading zeros
  if (( 10#$base % 2 == 0 )); then
    rm -f -- "$f"
  fi
done

# 3) Rebuild list after deletions.
remaining=( [0-9][0-9][0-9][0-9][0-9].png )

if (( ${#remaining[@]} == 0 )); then
  echo "All files were even-numbered; nothing left to renumber."
  exit 0
fi

echo "Renumbering ${#remaining[@]} remaining files to 00001.png, 00002.png, ..."

# 4) Two-pass rename to avoid collisions:
#    Pass A: move each file to a unique temp name encoding its future index.
idx=0
for f in "${remaining[@]}"; do
  ((idx++))
  printf -v newnum "%05d" "$idx"
  tmp=".__renum_${newnum}.tmp"
  mv -f -- "$f" "$tmp"
done

#    Pass B: move temps to their final names.
for tmp in .__renum_*.tmp; do
  # Extract target number and finalize as PNG
  tgt="${tmp#.__renum_}"     # e.g., 00003.tmp
  tgt="${tgt%.tmp}"          # e.g., 00003
  mv -f -- "$tmp" "${tgt}.png"
done

echo "Done."
