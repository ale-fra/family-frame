#!/usr/bin/env bash
set -euo pipefail

KEYRING_DEB="${KEYRING_DEB:-/tmp/synaptics-repository-keyring.deb}"
KEYRING_URL="${KEYRING_URL:-https://www.synaptics.com/sites/default/files/Ubuntu/pool/stable/main/all/synaptics-repository-keyring.deb}"

if [[ "${1:-}" == "--help" ]]; then
  echo "Installs the official Synaptics DisplayLink APT repository and displaylink-driver package."
  echo "Source: https://drivers.synaptics.com/products/displaylink-graphics/downloads/ubuntu"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download the Synaptics repository package." >&2
  exit 1
fi

echo "Downloading Synaptics repository keyring package..."
curl -fL "$KEYRING_URL" -o "$KEYRING_DEB"

echo "Installing Synaptics repository package..."
sudo apt install -y "$KEYRING_DEB"

echo "Updating APT cache..."
sudo apt update

echo "Installing DisplayLink driver..."
sudo apt install -y displaylink-driver

echo "DisplayLink driver installation complete. Reboot, then run: npm run display"
