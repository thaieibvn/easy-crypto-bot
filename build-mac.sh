#!/bin/bash

git pull --rebase
npm run mac

cd release-builds
rm easy-crypto-bot-mac.tar.gz
rm -rf easy-crypto-bot-mac

mv easy-crypto-bot-darwin-x64 easy-crypto-bot-mac
tar -czf easy-crypto-bot-mac.tar.gz easy-crypto-bot-mac/

