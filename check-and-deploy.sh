#!/bin/bash
# check-and-deploy.sh
# Save this file to /volume1/homes/buu/dev/0x50B.github.io/check-and-deploy.sh on your Synology NAS.

set -e # Exit immediately on error

SRC_DIR="/volume1/homes/buu/dev/0x50B.github.io"
DOCKER_BIN="/usr/local/bin/docker"
UID_GID="1026:100" # buu:users

# 1. Fetch latest changes from remote
$DOCKER_BIN run --rm \
  --user $UID_GID \
  -v "$SRC_DIR:/git" \
  -w "/git" \
  alpine/git fetch origin main

# 2. Get local HEAD hash and remote origin/main hash using alpine/git container
LOCAL=$($DOCKER_BIN run --rm --user $UID_GID -v "$SRC_DIR:/git" -w "/git" alpine/git rev-parse HEAD)
REMOTE=$($DOCKER_BIN run --rm --user $UID_GID -v "$SRC_DIR:/git" -w "/git" alpine/git rev-parse origin/main)

echo "Local:  $LOCAL"
echo "Remote: $REMOTE"

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "New commit detected. Deploying..."
  bash "$SRC_DIR/deploy.sh"
else
  echo "No changes detected. Site is up to date."
fi
