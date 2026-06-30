#!/bin/bash
# Deploy landing page — run on VPS via GitHub Actions or manually.
set -euo pipefail

REPO_DIR="/opt/interference"
WEB_ROOT="/var/www/interferenceagent.it"

cd "$REPO_DIR"
git checkout main
git pull origin main

# Copy static site
rm -rf "$WEB_ROOT"/*
cp -r site/* "$WEB_ROOT"/

echo "Deployed: $(date)" >> /var/log/interference-deploy.log
echo "OK — $(date)"
