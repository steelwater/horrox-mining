#!/usr/bin/env bash
set -euo pipefail

# Resolve the checkout from this script, even when invoked from another directory.
cd "$(dirname "${BASH_SOURCE[0]}")"
pwd
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

branch="$(git symbolic-ref --quiet --short HEAD || printf 'detached HEAD')"
commit="$(git rev-parse --short HEAD)"
printf 'Building debug playtest APK from %s (%s)\n' "$branch" "$commit"
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Working tree has local changes; these are included in the build.\n'
fi

if ! command -v npm >/dev/null 2>&1; then
  printf 'Error: npm is required. Install Node.js 24 and try again.\n' >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then
  printf 'Error: dependencies are missing. Run npm ci in %s first.\n' "$repo_root" >&2
  exit 1
fi

# Respect an explicit JDK; otherwise use this Mac's Android Studio runtime.
studio_java='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
if [[ -z "${JAVA_HOME:-}" && -x "$studio_java/bin/java" ]]; then
  export JAVA_HOME="$studio_java"
fi

npm run android:debug

apk="$repo_root/android/app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -s "$apk" ]]; then
  printf 'Error: build completed without the expected APK: %s\n' "$apk" >&2
  exit 1
fi
printf '\nAPK ready: %s\n' "$apk"
