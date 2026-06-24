#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BUILD_DIR="$FRONTEND_DIR/dist"
TARGET_DIR="${1:-${NGINX_WEB_ROOT:-}}"

if [[ -z "$TARGET_DIR" ]]; then
  cat <<'USAGE'
Missing Nginx web root path.

Usage:
  npm run deploy:frontend:nginx -- /var/www/html

or:
  NGINX_WEB_ROOT=/var/www/html npm run deploy:frontend:nginx

Set the path to the same folder used by Nginx `root`.
USAGE
  exit 1
fi

if [[ "$TARGET_DIR" == "/" || "$TARGET_DIR" == "/var" || "$TARGET_DIR" == "/var/www" ]]; then
  echo "Refusing to deploy to unsafe target: $TARGET_DIR" >&2
  exit 1
fi

TARGET_ABS="$(cd "$(dirname "$TARGET_DIR")" 2>/dev/null && pwd)/$(basename "$TARGET_DIR")"
PROJECT_ABS="$(cd "$PROJECT_ROOT" && pwd)"
if [[ "$TARGET_ABS" == "$PROJECT_ABS" ]]; then
  echo "Refusing to deploy to the project root: $TARGET_DIR" >&2
  echo "Point Nginx to frontend/dist or use a separate folder like /var/www/crypteex-web." >&2
  exit 1
fi

if [[ -f "$TARGET_DIR/package.json" || -d "$TARGET_DIR/frontend" || -d "$TARGET_DIR/nft-stake" ]]; then
  echo "Refusing to delete files in $TARGET_DIR because it looks like a source-code directory." >&2
  echo "Use frontend/dist as the Nginx root, or deploy to a separate web root folder." >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "Frontend directory not found: $FRONTEND_DIR" >&2
  exit 1
fi

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=()
else
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required to write to $TARGET_DIR and reload Nginx." >&2
    exit 1
  fi
  SUDO=(sudo)
fi

echo "Project root: $PROJECT_ROOT"
echo "Frontend: $FRONTEND_DIR"
echo "Build output: $BUILD_DIR"
echo "Nginx web root: $TARGET_DIR"

cd "$FRONTEND_DIR"

if [[ -f package-lock.json ]]; then
  echo "Installing frontend dependencies with npm ci..."
  npm ci
else
  echo "Installing frontend dependencies with npm install..."
  npm install
fi

echo "Building frontend..."
npm run build

if [[ ! -f "$BUILD_DIR/index.html" ]]; then
  echo "Build failed: $BUILD_DIR/index.html was not created." >&2
  exit 1
fi

BUILD_REALPATH="$(cd "$BUILD_DIR" && pwd)"
TARGET_PARENT="$(dirname "$TARGET_DIR")"
"${SUDO[@]}" mkdir -p "$TARGET_PARENT"
TARGET_REALPATH="$(cd "$TARGET_PARENT" && pwd)/$(basename "$TARGET_DIR")"

if [[ "$BUILD_REALPATH" == "$TARGET_REALPATH" ]]; then
  echo "Nginx already serves frontend/dist directly. Skipping copy."
else
  echo "Replacing old Nginx build..."
  "${SUDO[@]}" mkdir -p "$TARGET_DIR"
  "${SUDO[@]}" find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  "${SUDO[@]}" cp -a "$BUILD_DIR"/. "$TARGET_DIR"/
fi

if [[ -n "${NGINX_OWNER:-}" ]]; then
  echo "Changing ownership to $NGINX_OWNER..."
  "${SUDO[@]}" chown -R "$NGINX_OWNER" "$TARGET_DIR"
fi

echo "Testing Nginx configuration..."
"${SUDO[@]}" nginx -t

echo "Reloading Nginx..."
if command -v systemctl >/dev/null 2>&1; then
  "${SUDO[@]}" systemctl reload nginx
else
  "${SUDO[@]}" service nginx reload
fi

echo "Frontend deployed successfully."
