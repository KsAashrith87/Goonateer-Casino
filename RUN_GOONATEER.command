#!/bin/bash
cd "$(dirname "$0")"
clear
echo "=============================="
echo "     GOONATEER CASINO RUNNER"
echo "=============================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Install it from https://nodejs.org/ then run this again."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

echo "Node found: $(node -v)"
echo ""

if [ ! -d "node_modules" ]; then
  echo "Installing packages..."
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "npm install failed."
    read -p "Press Enter to close..."
    exit 1
  fi
fi

echo ""
echo "Starting server..."
echo "Open this in your browser: http://localhost:3000"
echo "Keep this window open while playing."
echo ""

npm start
