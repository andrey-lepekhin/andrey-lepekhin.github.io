#!/bin/bash

# Run this scrript in the root directory of your Jekyll source
# repository for your GitHub page, and it will commit and push
# the source to origin/source, then build, commit and push the 
# resuling HTML to your origin/master, i.e. your website. The
# commit message for both commits is given by the first 
# argument. Source: https://gist.github.com/drewsberry/1b9fc80682edd8bcecc4

if [[ -z "$1" ]]; then
  echo "Please enter a git commit message."
  exit
fi

git checkout source && \
  git add . && \
  git commit -am "Source: $1" && \
  git push origin source --force-with-lease && \
  echo "Source successfully pushed to GitHub."
  bundle exec jekyll build --future && \
  touch _site/.nojekyll && \
  cd _site && \
  git add . && \
  git commit -am "Built: $1" && \
  git push origin master --force-with-lease && \
  cd .. && \
  echo "Site successfully build and pushed to GitHub."
