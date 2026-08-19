#!/usr/bin/env bash
set -euo pipefail

# vinext 0.0.50 injects @font-face blocks into the SSR HTML using relative
# URLs (url(./geist-xxx.woff2)), which browsers resolve from the site root.
# The actual files land in dist/client/assets/_vinext_fonts/. Copy every font
# file into dist/client/ as well so /geist-*.woff2 requests succeed in both
# `vinext start` and deployed static hosting.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
font_src="${project_root}/.vinext/fonts"
font_dest="${project_root}/dist/client"

if [[ ! -d "${font_src}" ]]; then
  echo "copy-fonts: no .vinext/fonts cache, skipping"
  exit 0
fi

if [[ ! -d "${font_dest}" ]]; then
  echo "copy-fonts: dist/client missing, skipping"
  exit 0
fi

find "${font_src}" -type f \( -iname '*.woff2' -o -iname '*.woff' -o -iname '*.ttf' -o -iname '*.otf' -o -iname '*.eot' \) -print0 | while IFS= read -r -d '' src; do
  cp -f "${src}" "${font_dest}/$(basename "${src}")"
done
echo "copy-fonts: copied font files into dist/client/"
