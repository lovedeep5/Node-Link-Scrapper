#!/usr/bin/env bash
# Fail fast
set -e

echo "Installing Chromium for Puppeteer on Render..."

# Update packages & install Chromium
apt-get update
apt-get install -y chromium

# Export CHROME_PATH for runtime
echo "export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium" >> $HOME/.bashrc
