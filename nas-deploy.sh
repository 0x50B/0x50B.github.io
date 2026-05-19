#!/bin/bash
# nas-deploy.sh
# Save this file to /volume1/homes/buu/dev/0x50B.github.io/deploy.sh on your Synology NAS.

set -e # Exit immediately if any command returns a non-zero status

SRC_DIR="/volume1/homes/buu/dev/0x50B.github.io"
WEB_DIR="/volume2/web/raphaelbucher.ch"
DOCKER_BIN="/usr/local/bin/docker"
UID_GID="1026:100" # buu:users

echo "============================================="
echo "Starting Jekyll Build and Deploy on Synology"
echo "============================================="

# 1. Update source code from Git using alpine/git container (pulling over HTTPS)
echo "1. Pulling latest code from GitHub..."
$DOCKER_BIN run --rm \
  --user $UID_GID \
  -v "$SRC_DIR:/git" \
  -w "/git" \
  alpine/git pull origin main

# 2. Build the Jekyll site using Docker
echo "2. Building Jekyll site via Docker container..."
# We mount a persistent Docker volume 'jekyll-bundle-cache' to avoid noexec issues
# and cache gem installations. We use custom entrypoint to set local bundle path.
$DOCKER_BIN run --rm \
  --user $UID_GID \
  -v "jekyll-bundle-cache:/bundle" \
  -v "$SRC_DIR:/srv/jekyll" \
  -w "/srv/jekyll" \
  --entrypoint /bin/sh \
  jekyll/jekyll:4 \
  -c "bundle config set --local path '/bundle' && bundle install && bundle exec jekyll build"

# 3. Sync built site to Web Station path
echo "3. Syncing built site to Web Station folder..."
mkdir -p "$WEB_DIR"
# Using rsync to copy changed files and delete removed files in the target directory
rsync -avz --delete "$SRC_DIR/_site/" "$WEB_DIR/"

echo "============================================="
echo "Deployment Completed Successfully!"
echo "============================================="
