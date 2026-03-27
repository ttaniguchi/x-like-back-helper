---
name: chrome-extension-release
description: Helps users prepare a Chrome Extension for store release, providing a checklist for icons, promotional images, manifest settings, and store metadata.
---

# Chrome Extension Release Preparation

This skill provides a comprehensive guide and checklist for preparing a Chrome Extension for the Chrome Web Store.

## When to Use This Skill

Use this skill when you are ready to release or update a Chrome Extension and need to ensure all required assets and metadata are prepared correctly.

## Required Assets Checklist

### 1. Extension Icons (in `icons/` directory)
Chrome requires specific icon sizes for different contexts. 
- [ ] `icon16.png`: Favicon, extension pages
- [ ] `icon32.png`: Windows (optional but recommended)
- [ ] `icon48.png`: Extension management page
- [ ] `icon128.png`: Chrome Web Store detail page

### 2. Store Promotional Images (in `images/` directory)
- [ ] **Screenshots**: At least one (1280x800 or 640x400).
- [ ] **Small Promo Tile**: 440x280 (Mandatory).
- [ ] **Marquee Promo Tile**: 1400x560 (Required for featuring).

### 3. Store Metadata (`STORE.md`)
Prepare the following text in a markdown file for easy copy-pasting:
- [ ] **Description**: Key features, "How to use", and version notes.
- [ ] **Privacy Policy**: Justification for each permission used.
- [ ] **Permissions Summary**: Why you need `storage`, `activeTab`, `sidePanel`, etc.

## Manifest Configuration (V3)

Ensure `manifest.json` includes:
- [ ] `version`: Incremented for updates.
- [ ] `icons`: Paths to all required icon sizes.
- [ ] `permissions`: Only those strictly necessary.
- [ ] `action`: Default icon settings.

## Packaging for Release

Use a script to consistently package the extension, excluding development files like `.DS_Store` or `.git`.

### Example `package.sh`
```bash
#!/bin/bash
VERSION=$(grep '"version":' manifest.json | sed -E 's/.*"version": "([^"]+)".*/\1/')
PACKAGE_NAME="extension-v$VERSION.zip"
mkdir -p releases
zip -r "releases/$PACKAGE_NAME" \
  manifest.json \
  background.js \
  content.js \
  icons \
  popup.html \
  -x "*.DS_Store*"
```

## Best Practices
- **Version Management**: Always increment the version in `manifest.json` before zipping.
- **Privacy Policy**: Be transparent about data usage to pass review quickly.
- **Store Assets**: Use high-quality, descriptive images to attract users.
