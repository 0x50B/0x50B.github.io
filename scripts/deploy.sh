#!/bin/bash
#
# Deployment script for raphaelbucher.ch
# Run this on the Synology NAS
#
set -e

REPO_DIR="/var/services/homes/buu/dev/0x50B.github.io"
WEB_DIR="/volume2/web/raphaelbucher.ch"

echo "[$(date)] Starting deployment..."

cd "$REPO_DIR"

git pull origin main

# Use locally installed gems (from bundle config set --local path 'vendor/bundle')
export PATH="$REPO_DIR/vendor/bundle/bin:$PATH"
export JEKYLL_ENV=production

bundle exec jekyll build

rsync -av --delete _site/ "$WEB_DIR/"

echo "[$(date)] Deployment finished successfully."