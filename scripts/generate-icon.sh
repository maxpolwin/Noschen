#!/bin/bash

# Generate macOS .icns icon from SVG
# Requires: Inkscape or rsvg-convert, and iconutil (comes with Xcode)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"
SVG_FILE="$BUILD_DIR/icon.svg"
ICONSET_DIR="$BUILD_DIR/icon.iconset"

echo "Generating macOS icon from SVG..."

# Create iconset directory
mkdir -p "$ICONSET_DIR"

# Check for available SVG converter
if command -v rsvg-convert &> /dev/null; then
    CONVERTER="rsvg-convert"
elif command -v inkscape &> /dev/null; then
    CONVERTER="inkscape"
elif command -v sips &> /dev/null; then
    # Fallback: use sips with a pre-made PNG
    CONVERTER="sips"
else
    echo "Error: No SVG converter found."
    echo "Please install one of: librsvg, inkscape"
    echo "  brew install librsvg"
    echo "  OR"
    echo "  brew install inkscape"
    exit 1
fi

# Function to convert SVG to PNG at specific size
convert_svg() {
    local size=$1
    local output=$2

    if [ "$CONVERTER" = "rsvg-convert" ]; then
        rsvg-convert -w "$size" -h "$size" "$SVG_FILE" -o "$output"
    elif [ "$CONVERTER" = "inkscape" ]; then
        inkscape "$SVG_FILE" -w "$size" -h "$size" -o "$output" 2>/dev/null
    fi
}

echo "Using converter: $CONVERTER"

# Generate all required sizes for macOS iconset
sizes=(16 32 64 128 256 512 1024)

for size in "${sizes[@]}"; do
    echo "  Generating ${size}x${size}..."
    convert_svg "$size" "$ICONSET_DIR/icon_${size}x${size}.png"

    # For retina displays (@2x)
    if [ "$size" -le 512 ]; then
        double=$((size * 2))
        half=$((size))
        convert_svg "$double" "$ICONSET_DIR/icon_${half}x${half}@2x.png"
    fi
done

# Rename files to match Apple's expected naming
mv "$ICONSET_DIR/icon_16x16.png" "$ICONSET_DIR/icon_16x16.png" 2>/dev/null || true
mv "$ICONSET_DIR/icon_32x32.png" "$ICONSET_DIR/icon_32x32.png" 2>/dev/null || true
mv "$ICONSET_DIR/icon_64x64.png" "$ICONSET_DIR/icon_32x32@2x.png" 2>/dev/null || true
mv "$ICONSET_DIR/icon_128x128.png" "$ICONSET_DIR/icon_128x128.png" 2>/dev/null || true
mv "$ICONSET_DIR/icon_256x256.png" "$ICONSET_DIR/icon_256x256.png" 2>/dev/null || true
mv "$ICONSET_DIR/icon_512x512.png" "$ICONSET_DIR/icon_512x512.png" 2>/dev/null || true
mv "$ICONSET_DIR/icon_1024x1024.png" "$ICONSET_DIR/icon_512x512@2x.png" 2>/dev/null || true

# Create .icns file
echo "Creating .icns file..."
iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"

# Also create a 1024x1024 PNG for other uses
convert_svg 1024 "$BUILD_DIR/icon.png"

# Cleanup
rm -rf "$ICONSET_DIR"

echo "Done! Icon created at: $BUILD_DIR/icon.icns"
