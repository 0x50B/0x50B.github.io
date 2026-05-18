#!/bin/bash
#
# Deployment script for raphaelbucher.ch
# Set REPO_DIR and WEB_DIR via environment variables or Task Scheduler
#
set -e

if [ -z "$REPO_DIR" ] || [ -z "$WEB_DIR" ]; then
  echo "Error: REPO_DIR and WEB_DIR must be set"
  exit 1
fi

echo "[$(date)] Starting deployment..."

cd "$REPO_DIR"

echo "Pulling latest changes..."
git pull origin main

echo "Building Jekyll site..."
export JEKYLL_ENV=production
bundle exec jekyll build

echo "Deploying to web folder..."
rsync -av --delete _site/ "$WEB_DIR/"

echo "[$(date)] Deployment finished successfully."