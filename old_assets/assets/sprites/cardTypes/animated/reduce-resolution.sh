#!/bin/bash

# Usage:
# ./scale_pngs.sh 0.5
# (This will scale all .png images in the folder to 50%)

FACTOR="$1"

if [ -z "$FACTOR" ]; then
  echo "Please provide a scale factor (e.g., 0.5)"
  exit 1
fi

for img in *.png; do
  if [ -f "$img" ]; then
    echo "Scaling $img by factor $FACTOR..."
    sips --resampleWidth $(echo "$(sips -g pixelWidth "$img" | tail -n1 | cut -d: -f2 | tr -d ' ')*$FACTOR" | bc | awk '{print int($1)}') "$img" >/dev/null
  fi
done

echo "Done!"
