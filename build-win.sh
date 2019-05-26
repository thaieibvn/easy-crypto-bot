#!/bin/bash
npm run win32
npm run win64

cd release-builds

mv easy-crypto-bot-win32-ia32 easy-crypto-bot-win32
mv easy-crypto-bot-win32-x64 easy-crypto-bot-win64

cp -r assets/ easy-crypto-bot-win32
mv easy-crypto-bot-win32/easy-crypto-bot.exe easy-crypto-bot-win32/EasyCryptoBot.exe 
cp -r assets/ easy-crypto-bot-win64
mv easy-crypto-bot-win64/easy-crypto-bot.exe easy-crypto-bot-win64/EasyCryptoBot.exe 


