#!/bin/sh
# Builds and (re)starts the production stack.
set -eu
cd "$(dirname "$0")/.."
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build --remove-orphans
docker compose --env-file .env.prod -f compose.prod.yaml ps
