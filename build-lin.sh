#!/bin/bash

git pull --rebase

#npm run lin32
npm run lin64

cd release-builds
#rm easy-crypto-bot-lin32.tar.gz
rm easy-crypto-bot-lin64.tar.gz
#rm -rf easy-crypto-bot-lin32
rm -rf easy-crypto-bot-lin64

#mv easy-crypto-bot-linux-ia32 easy-crypto-bot-lin32
mv easy-crypto-bot-linux-x64 easy-crypto-bot-lin64

#mkdir easy-crypto-bot-lin32/assets
#mkdir easy-crypto-bot-lin32/assets/icons
#cp ../assets/icons/icon.png easy-crypto-bot-lin32/assets/icons/icon.png
#cp ../assets/icons/icon.ico easy-crypto-bot-lin32/assets/icons/icon.ico
#cp easy-crypto-bot-lin32/assets/icons/icon.png easy-crypto-bot-lin32/icon.png
#chmod +x easy-crypto-bot-lin32/easy-crypto-bot
#tar -czf easy-crypto-bot-lin32.tar.gz easy-crypto-bot-lin32/

mkdir easy-crypto-bot-lin64/assets
mkdir easy-crypto-bot-lin64/assets/icons
cp ../assets/icons/icon.png easy-crypto-bot-lin64/assets/icons/icon.png
cp ../assets/icons/icon.ico easy-crypto-bot-lin64/assets/icons/icon.ico
cp easy-crypto-bot-lin64/assets/icons/icon.png easy-crypto-bot-lin64/icon.png
chmod +x easy-crypto-bot-lin64/easy-crypto-bot
tar -czf easy-crypto-bot-lin64.tar.gz easy-crypto-bot-lin64/
