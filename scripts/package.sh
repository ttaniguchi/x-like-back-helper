#!/bin/bash

# Extract version from manifest.json
VERSION=$(grep '"version":' manifest.json | sed -E 's/.*"version": "([^"]+)".*/\1/')

if [ -z "$VERSION" ]; then
  echo "Error: Could not find version in manifest.json"
  exit 1
fi

PACKAGE_NAME="x-like-back-helper-v$VERSION.zip"
RELEASE_DIR="releases"

echo "Packaging version $VERSION into $RELEASE_DIR/$PACKAGE_NAME..."

# Create releases directory if it doesn't exist
mkdir -p "$RELEASE_DIR"

# Zip files
zip -r "$RELEASE_DIR/$PACKAGE_NAME" \
  manifest.json \
  content.js \
  popup.html \
  popup.js \
  popup.css \
  icons \
  LICENSE \
  README.md \
  -x "*.DS_Store*"

echo "Successfully created $RELEASE_DIR/$PACKAGE_NAME"
