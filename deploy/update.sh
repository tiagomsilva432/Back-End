#!/bin/sh
# Pulls both repositories and redeploys.
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only
git -C "${FRONTEND_DIR:-../Front-End}" pull --ff-only
sh ./deploy/up.sh
