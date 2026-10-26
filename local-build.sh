#!/bin/bash

set -e  # Exit on any error

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
case "$ARCH" in
  x86_64)
    ARCH="x64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    echo "⚠️  Warning: Unknown architecture $ARCH, using as-is"
    ;;
esac

# Map OS names
case "$OS" in
  linux)
    OS="linux"
    ;;
  darwin)
    OS="macos"
    ;;
  *)
    echo "⚠️  Warning: Unknown OS $OS, using as-is"
    ;;
esac

PLATFORM="${OS}-${ARCH}"

# Set CARGO_TARGET_DIR if not defined
if [ -z "$CARGO_TARGET_DIR" ]; then
  CARGO_TARGET_DIR="target"
fi

echo "🔍 Detected platform: $PLATFORM"
echo "🔧 Using target directory: $CARGO_TARGET_DIR"

# Remote features are disabled unless VK_SHARED_API_BASE is set in the
# environment, which matches the release workflow and `pnpm run dev`.
# To build against a shared API server, export it first (crates/remote/README.md).
if [ -n "${VK_SHARED_API_BASE:-}" ]; then
  export VK_SHARED_API_BASE
  export VITE_VK_SHARED_API_BASE="${VITE_VK_SHARED_API_BASE:-$VK_SHARED_API_BASE}"
  echo "🌐 Shared API base: $VK_SHARED_API_BASE"
else
  echo "🌐 No shared API base set; remote features disabled in this build"
fi

echo "🧹 Cleaning previous builds..."
rm -rf npx-cli/dist
mkdir -p npx-cli/dist/$PLATFORM

echo "🔨 Building frontend..."
(cd frontend && npm run build)

echo "🔨 Building Rust binaries..."
cargo build --release --manifest-path Cargo.toml
cargo build --release --bin mcp_task_server --manifest-path Cargo.toml

echo "📦 Creating distribution package..."

# Copy the main binary
cp ${CARGO_TARGET_DIR}/release/server kablan
zip -q kablan.zip kablan
rm -f kablan 
mv kablan.zip npx-cli/dist/$PLATFORM/kablan.zip

# Copy the MCP binary
cp ${CARGO_TARGET_DIR}/release/mcp_task_server kablan-mcp
zip -q kablan-mcp.zip kablan-mcp
rm -f kablan-mcp
mv kablan-mcp.zip npx-cli/dist/$PLATFORM/kablan-mcp.zip

echo "✅ Build complete!"
echo "📁 Files created:"
echo "   - npx-cli/dist/$PLATFORM/kablan.zip"
echo "   - npx-cli/dist/$PLATFORM/kablan-mcp.zip"
echo ""
echo "🚀 To test locally, run:"
echo "   cd npx-cli && node bin/cli.js"
