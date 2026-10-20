#!/bin/bash
# Nahrá hru na partaci.com/hry/mathemagic: skopíruje súbory do nahrávacieho repa (TheVilo/kralovstvo-hra),
# pushne a GitHub Action ich cez SFTP nahrá na Websupport. Zároveň pushne zmeny do TheVilo/mathemagic (GitHub Pages).
set -e
HRA="$(cd "$(dirname "$0")" && pwd)"
CIEL="$HRA/../Rodinne hry/kralovstvo-nasadenie/mathemagic"
mkdir -p "$CIEL"
rsync -a --delete --exclude '.git' --exclude '.DS_Store' --exclude 'nastroje' --exclude 'zdroj' \
  --exclude 'mathemagic.html' --exclude 'scena3d/mathemagic-3d.html' --exclude 'nahraj-na-server.sh' \
  --exclude 'README.md' --exclude '.gitignore' --exclude '.nojekyll' "$HRA/" "$CIEL/"
cd "$CIEL/.."
git add -A mathemagic .github/workflows/mathemagic.yml
git commit -q -m "Mathemagic $(date '+%Y-%m-%d %H:%M')" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q || echo "Žiadne zmeny na nahratie."
cd "$HRA"
git add -A && (git commit -q -m "Nová verzia $(date '+%Y-%m-%d %H:%M')" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q) || true
echo "Hotovo. Stav nahrávania: gh run list -R TheVilo/kralovstvo-hra -L 3"
