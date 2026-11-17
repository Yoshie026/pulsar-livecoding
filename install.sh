#!/bin/zsh
# Installs dependencies and links the packages + config into Pulsar.
# Safe to re-run. Existing config files are kept as *.bak before being replaced.
set -e

REPO=${0:A:h}
PULSAR=${ATOM_HOME:-$HOME/.pulsar}
mkdir -p "$PULSAR/packages"

echo "== npm install"
for dir in "$REPO"/packages/*(/) "$REPO/bridge"; do
  echo "-- ${dir#$REPO/}"
  (cd "$dir" && npm install --no-audit --no-fund)
done

echo "== build strudel bundle"
(cd "$REPO/packages/pulsar-strudel" && npm run build)

link() { # link <target> <link path>
  if [[ -e "$2" && ! -L "$2" ]]; then
    echo "   backing up $2 -> $2.bak"
    mv "$2" "$2.bak"
  fi
  ln -sfn "$1" "$2"
  echo "   $2 -> $1"
}

echo "== link packages into $PULSAR/packages"
for dir in "$REPO"/packages/*(/); do
  link "$dir" "$PULSAR/packages/${dir:t}"
done

echo "== link config into $PULSAR"
for file in "$REPO"/config/*(.); do
  link "$file" "$PULSAR/${file:t}"
done

echo "done - reload Pulsar (View > Developer > Reload Window)"
