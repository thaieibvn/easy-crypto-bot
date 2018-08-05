#!/bin/bash

rm easy-crypto-bot-mac.tar.gz
cd easy-crypto-bot
git pull --rebase
npm run mac
cd release-builds
rm -rf easy-crypto-bot-mac
mv easy-crypto-bot-darwin-x64 easy-crypto-bot-mac
tar -czf easy-crypto-bot-mac.tar.gz easy-crypto-bot-mac/
cd ../../
mv easy-crypto-bot/release-builds/easy-crypto-bot-mac.tar.gz ./
