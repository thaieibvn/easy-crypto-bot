#!/bin/bash
npm run lin32
npm run lin64
npm run win32
npm run win64

cd release-builds

mv easy-crypto-bot-linux-ia32 easy-crypto-bot-lin32
mv easy-crypto-bot-linux-x64 easy-crypto-bot-lin64
mv easy-crypto-bot-win32-ia32 easy-crypto-bot-win32
mv easy-crypto-bot-win32-x64 easy-crypto-bot-win64

cp -r assets/ easy-crypto-bot-lin32
cp assets/icons/icon.png easy-crypto-bot-lin32
#chmod +x easy-crypto-bot-lin32/easy-crypto-bot
#tar -czf easy-crypto-bot-lin32.tar.gz easy-crypto-bot-lin32/

cp -r assets/ easy-crypto-bot-lin64
cp assets/icons/icon.png easy-crypto-bot-lin64
#chmod +x easy-crypto-bot-lin64/easy-crypto-bot
#tar -czf easy-crypto-bot-lin64.tar.gz easy-crypto-bot-lin64/

cp -r assets/ easy-crypto-bot-win32
mv easy-crypto-bot-win32/easy-crypto-bot.exe easy-crypto-bot-win32/EasyCryptoBot.exe 
cp -r assets/ easy-crypto-bot-win64
mv easy-crypto-bot-win64/easy-crypto-bot.exe easy-crypto-bot-win64/EasyCryptoBot.exe 


