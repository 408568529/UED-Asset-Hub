#!/bin/bash
set -eu
UED_PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd -P)"
if ! /usr/bin/env -u NODE_OPTIONS -u NODE_PATH -u NODE_COMPILE_CACHE "$UED_PACKAGE_DIR/tools/node/bin/node" "$UED_PACKAGE_DIR/tools/competition-launcher.mjs" Stop "$UED_PACKAGE_DIR"; then
  read -r -p "Operation failed. Press Enter to close." _ued_answer
  exit 1
fi
