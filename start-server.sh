#!/bin/bash

# Simple server starter for Mac/Linux
# Run with: bash start-server.sh
# Or make executable: chmod +x start-server.sh && ./start-server.sh

echo ""
echo "========================================"
echo "  Mines Game - Starting Server"
echo "========================================"
echo ""

install_node() {
    if command -v brew &> /dev/null; then
        echo "📦 Installing Node.js with Homebrew..."
        brew install node || return 1
    elif command -v apt-get &> /dev/null; then
        echo "📦 Installing Node.js with apt..."
        sudo apt-get update && sudo apt-get install -y nodejs npm || return 1
    elif command -v yum &> /dev/null; then
        echo "📦 Installing Node.js with yum..."
        sudo yum install -y nodejs npm || return 1
    else
        echo "❌ ERROR: Unable to install Node.js automatically on this system."
        return 1
    fi

    if ! command -v node &> /dev/null && command -v nodejs &> /dev/null; then
        echo "ℹ️ Creating node alias for nodejs binary..."
        sudo ln -s "$(command -v nodejs)" /usr/local/bin/node || true
    fi
}

ensure_node() {
    if command -v node &> /dev/null; then
        echo "✅ Node.js found: $(node --version)"
        echo ""
        return 0
    fi

    echo "❌ Node.js is not installed. Attempting to install..."
    if install_node; then
        if command -v node &> /dev/null; then
            echo "✅ Node.js installed: $(node --version)"
            echo ""
            return 0
        fi
    fi

    echo "❌ ERROR: Node.js is required but could not be installed automatically."
    echo ""
    echo "Please install Node.js from: https://nodejs.org/"
    echo ""
    exit 1
}

ensure_node

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    echo ""
    npm install
    echo ""
fi

# Start the development server
echo "🚀 Starting Vite development server..."
echo ""
echo "The game will open automatically in your browser."
echo "If not, navigate to: http://<your-ip>:3000"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

npm run dev -- --host 0.0.0.0 --port 3000
