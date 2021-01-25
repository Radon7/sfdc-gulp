#!/bin/bash
set -e

echo '-------- merging source with target --------'
git config user.email "deploy-user-here"
git config user.name "GitLab Deploy Bot"
git fetch origin
git pull origin ${TARGET} --no-edit || exit 4
git add .
git diff --diff-filter=d --name-only HEAD^ HEAD > ./build/diffs.csv