#!/bin/bash
set -euo pipefail
native_root="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$native_root/bin"
swiftc -swift-version 5 -O \
  -target "$(uname -m)-apple-macosx13.0" \
  -framework AppKit -framework AVFoundation -framework Speech -framework ApplicationServices \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$native_root/Info.plist" \
  "$native_root/FlowSpeech.swift" -o "$native_root/bin/flow-speech"
codesign --force --sign - --entitlements "$native_root/entitlements.plist" "$native_root/bin/flow-speech"
"$native_root/bin/flow-speech" --self-test
