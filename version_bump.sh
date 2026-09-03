#!/bin/sh

# Bump the version
npm version patch --git-tag-version=false

# Get the current version from package.json
VERSION=$(node -p "require('./package.json').version")

# Update the HTML file with the version as a data attribute
# Using a portable approach for macOS and Linux
if [ "$(uname)" = "Darwin" ]; then
  # macOS requires an extension argument (can be empty)
  sed -i '' "s/<html data-version=\"[^\"]*\"/<html data-version=\"$VERSION\"/" packages/frontend/index.html
else
  # Linux
  sed -i "s/<html data-version=\"[^\"]*\"/<html data-version=\"$VERSION\"/" packages/frontend/index.html
fi

echo "Version bumped to $VERSION and added to index.html"

git add package.json
git add pnpm-lock.yaml
git add version_bump.sh
git add packages/frontend/index.html

git commit -m "chore: bump version to $VERSION"
