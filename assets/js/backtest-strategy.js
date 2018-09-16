//EasyCryptoBot Copyright (C) 2018 Stefan Hristov

const smallNumber = 0.000001;
function addBuySpread(price) {
  return price < smallNumber
    ? price + 0.00000001
    : price * 1.004;
}
function addSellSpread(price) {
  return price < smallNumber
    ? price - 0.00000001
    : price * 0.996;
}

function get1mData(startTime, timeframe, ticks1m, lastIndex) {
  let endDate = new Date(startTime.getTime());
  switch (timeframe) {
    case '3 minutes':
      endDate.setMinutes(endDate.getMinutes() + 3);
      break;
    case '5 minutes':
      endDate.setMinutes(endDate.getMinutes() + 5);
      break;
    case '15 minutes':
      endDate.setMinutes(endDate.getMinutes() + 15);
      break;
    case '30 minutes':
      endDate.setMinutes(endDate.getMinutes() + 30);
      break;
    case '1 hour':
      endDate.setHours(endDate.getHours() + 1);
      break;
    case '2 hours':
      endDate.setHours(endDate.getHours() + 2);
      break;
    case '4 hours':
      endDate.setHours(endDate.getHours() + 4);
      break;
    case '6 hours':
      endDate.setHours(endDate.getHours() + 6);
      break;
    case '12 hours':
      endDate.setHours(endDate.getHours() + 12);
      break;
    case '1 day':
      endDate.setHours(endDate.getHours() + 24);
      break;
  }

  let result = [];
  for (; lastIndex < ticks1m.length; lastIndex++) {
    if (startTime <= ticks1m[lastIndex].d && ticks1m[lastIndex].d < endDate) {
      let closePrice = ticks1m[lastIndex].c;
      let openPrice = ticks1m[lastIndex].o;
      let highPrice = ticks1m[lastIndex].h;
      let lowPrice = ticks1m[lastIndex].l;
      result.push([
        ticks1m[lastIndex].d,
        openPrice,
        highPrice,
        lowPrice
      ]);
      if (openPrice >= closePrice) {
        if (highPrice !== openPrice) {
          result.push([
            ticks1m[lastIndex].d,
            highPrice,
            highPrice,
            lowPrice
          ]);
          result.push([
            ticks1m[lastIndex].d,
            openPrice,
            highPrice,
            lowPrice
          ]);
        }
        if (closePrice !== openPrice) {
          result.push([
            ticks1m[lastIndex].d,
            closePrice,
            highPrice,
            lowPrice
          ]);
          if (closePrice !== lowPrice) {
            result.push([
              ticks1m[lastIndex].d,
              lowPrice,
              highPrice,
              lowPrice
            ]);
            result.push([
              ticks1m[lastIndex].d,
              closePrice,
              highPrice,
              lowPrice
            ]);
          }
        }
      } else {
        if (lowPrice !== openPrice) {
          result.push([
            ticks1m[lastIndex].d,
            lowPrice,
            highPrice,
            lowPrice
          ]);
          result.push([
            ticks1m[lastIndex].d,
            openPrice,
            highPrice,
            lowPrice
          ]);
        }
          result.push([
            ticks1m[lastIndex].d,
            closePrice,
            highPrice,
            lowPrice
          ]);
          if (closePrice !== highPrice) {
            result.push([
              ticks1m[lastIndex].d,
              highPrice,
              highPrice,
              lowPrice
            ]);
            result.push([
              ticks1m[lastIndex].d,
              closePrice,
              lowPrice,
              lowPrice
            ]);
          }

      }
    }
    if (ticks1m[lastIndex].d >= endDate) {
      break;
    }
  }
  return [result, lastIndex];
}

let cancelBtExecution = false;
function cancelBacktest() {
  cancelBtExecution = true;
}
async function executeBacktest(strategy, ticks, ticks1m, timeframe, startDate, useSleep) {
  cancelBtExecution = false;
  let feeRate = 0.1;
  let trades = [];
  let tradeType = 'buy';
  let stoploss = Number.MIN_VALUE;
  let target = Number.MAX_VALUE;
  let closePrices = [];

  if (timeframe !== '1 minute') {
    let lastIndex1m = 0;
    for (let i = 0; i < ticks.length; i++) {
      if (cancelBtExecution) {
        return null;
      }
      if (useSleep && i > 100 && i % 100 === 0) {
        await sleep(0);
      }
      let closePrice = ticks[i].c;
      let curDate = ticks[i].d;
      if (curDate < startDate) {
        closePrices.push(closePrice);
        continue;
      }
      let pricesToCheck = get1mData(curDate, timeframe, ticks1m, lastIndex1m);
      lastIndex1m = pricesToCheck[1];
      let priceToCheckIndex = 0;
      for (let priceToCkeckData of pricesToCheck[0]) {
        if (cancelBtExecution) {
          return null;
        }
        if (useSleep && priceToCheckIndex > 500 && priceToCheckIndex % 500 === 0) {
          await sleep(0);
        }
        priceToCheckIndex++;
        let date = priceToCkeckData[0];
        if (tradeType === 'buy') {
          if (trades.length > 0 && curDate.getTime() === trades[trades.length - 1].closeDateOrg.getTime()) {
            break;
          }
          let priceToCkeck = Math.min(addBuySpread(priceToCkeckData[1]), priceToCkeckData[2]);
          if (priceToCkeck < smallNumber &&  priceToCkeckData[3] === priceToCkeckData[1]) {
            continue;
          }
          if (checkTradeRules(strategy.buyRules, closePrices, priceToCkeck)) {
            let trade = {
              'openDate': date,
              'openDateOrg': curDate,
              'entry': priceToCkeck,
              'result': 0
            };
            if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
              stoploss = priceToCkeck * (1 - (strategy.stoploss / 100))
            }
            if (strategy.target !== null && !isNaN(strategy.target)) {
              target = priceToCkeck * (1 + (strategy.target / 100))
            }
            trades.push(trade);
            tradeType = 'sell'
            continue;
          }
        } else {
          let priceToCkeck = Math.max(addSellSpread(priceToCkeckData[1]), priceToCkeckData[3]);
          if (priceToCkeck < smallNumber &&  priceToCkeckData[2] === priceToCkeckData[1]) {
            continue;
          }
          if (stoploss >= priceToCkeck) {
            trades[trades.length - 1]['closeDate'] = date;
            trades[trades.length - 1]['closeDateOrg'] = curDate;
            trades[trades.length - 1]['exit'] = priceToCkeck;
            trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
            tradeType = 'buy';
            continue;
          }
          if (target <= priceToCkeck) {
            trades[trades.length - 1]['closeDate'] = date;
            trades[trades.length - 1]['closeDateOrg'] = curDate;
            trades[trades.length - 1]['exit'] = priceToCkeck;
            trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
            tradeType = 'buy';
            continue;
          }
          if (strategy.sellRules.length === 0) {
            continue;
          }

          if (checkTradeRules(strategy.sellRules, closePrices, priceToCkeck)) {
            trades[trades.length - 1]['closeDate'] = date;
            trades[trades.length - 1]['closeDateOrg'] = curDate;
            trades[trades.length - 1]['exit'] = priceToCkeck;
            trades[trades.length - 1]['result'] = (((priceToCkeck - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
            tradeType = 'buy';
          }
        }
      }
      closePrices.push(closePrice);
    }
  } else {
    for (let i = 0; i < ticks.length; i++) {
      if (cancelBtExecution) {
        return null;
      }
      if (useSleep && i > 100 && i % 100 === 0) {
        await sleep(0);
      }
      let closePrice = ticks[i].c;
      let openPrice = ticks[i].o;
      let highPrice = ticks[i].h;
      let lowPrice = ticks[i].l;
      let curDate = ticks[i].d
      if (curDate < startDate) {
        closePrices.push(closePrice);
        continue;
      }

      let pricesToCheck = [];
      pricesToCheck.push(openPrice);
      if (openPrice >= closePrice) {
        if (highPrice !== openPrice) {
          pricesToCheck.push(highPrice);
          pricesToCheck.push(openPrice);
        }
        if (closePrice !== openPrice) {
          pricesToCheck.push(closePrice);
          if (closePrice !== lowPrice) {
            pricesToCheck.push(lowPrice);
            pricesToCheck.push(closePrice);
          }
        }
      } else {
        if (lowPrice !== openPrice) {
          pricesToCheck.push(lowPrice);
          pricesToCheck.push(openPrice);
        }
        pricesToCheck.push(closePrice);
        if (closePrice !== highPrice) {
          pricesToCheck.push(highPrice);
          pricesToCheck.push(closePrice);
        }
      }

      for (let priceToCkeck of pricesToCheck) {
        if (cancelBtExecution) {
          return null;
        }
        let date = ticks[i].d;
        if (tradeType === 'buy') {
          //Only one trade per candle for the given timeframe
          if (trades.length > 0 && date.getTime() === trades[trades.length - 1].closeDateOrg.getTime()) {
            break;
          }
          let priceToCkeckTmp = priceToCkeck;
          priceToCkeck = Math.min(addBuySpread(priceToCkeck), highPrice);
          if (priceToCkeck < smallNumber && lowPrice === priceToCkeckTmp) {
            continue;
          }
          if (checkTradeRules(strategy.buyRules, closePrices, priceToCkeck)) {
            let trade = {
              'openDate': date,
              'openDateOrg': date,
              'entry': priceToCkeck,
              'result': 0
            };
            if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
              stoploss = priceToCkeck * (1 - (strategy.stoploss / 100))
            }
            if (strategy.target !== null && !isNaN(strategy.target)) {
              target = priceToCkeck * (1 + (strategy.target / 100))
            }
            trades.push(trade);
            tradeType = 'sell'
            continue;
          }
        } else {
          let priceToCkeckTmp = priceToCkeck;
          priceToCkeck = Math.max(addSellSpread(priceToCkeck), lowPrice);
          if (priceToCkeck < smallNumber && highPrice === priceToCkeckTmp) {
            continue;
          }
          if (stoploss >= priceToCkeck) {
            trades[trades.length - 1]['closeDate'] = date;
            trades[trades.length - 1]['closeDateOrg'] = date;
            trades[trades.length - 1]['exit'] = priceToCkeck;
            trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
            tradeType = 'buy';
            continue;
          }
          if (target <= priceToCkeck) {
            trades[trades.length - 1]['closeDate'] = date;
            trades[trades.length - 1]['closeDateOrg'] = date;
            trades[trades.length - 1]['exit'] = priceToCkeck;
            trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
            tradeType = 'buy';
            continue;
          }
          if (strategy.sellRules.length === 0) {
            continue;
          }
          if (checkTradeRules(strategy.sellRules, closePrices, priceToCkeck)) {
            trades[trades.length - 1]['closeDate'] = date;
            trades[trades.length - 1]['closeDateOrg'] = date;
            trades[trades.length - 1]['exit'] = priceToCkeck;
            trades[trades.length - 1]['result'] = (((priceToCkeck - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
            tradeType = 'buy';
          }
        }
      }
      closePrices.push(closePrice);
    }
  }
  //END
  let lastTrade = null;
  if (trades.length > 0 && tradeType === 'sell') {
    lastTrade = trades.pop();
  }

  let result = {};
  result.totalReturn = 0;
  result.winLossRatio = 0;
  result.avgGainLossPerTrade = 0;
  result.resultWithUSD = 0;
  result.executedTrades = trades.length;

  result.winningPercent = 0;
  result.winnignCount = 0;
  result.avgWinPerTrade = 0;
  result.biggestGain = 0;

  result.loosingPercent = 0;
  result.loosingCount = 0;
  result.avgLostPerTrade = 0;
  result.biggestLost = 0;
  result.maxDrawdown = 0;
  result.strategy = strategy;

  let count = 1;
  let prevIsLoosing = false;
  let drawdowns = [];
  let tmpDate = new Date();
  for (let trade of trades) {
    if (cancelBtExecution) {
      return null;
    }
    if (useSleep && count > 500 && count % 500 === 0) {
      await sleep(0);
    }
    if (trade.result > 0) {
      prevIsLoosing = false;
      if (result.biggestGain < trade.result) {
        result.biggestGain = trade.result;
      }
      result.winnignCount++;
      result.avgWinPerTrade += trade.result;
    } else if (trade.result < 0) {

      if (prevIsLoosing) {
        drawdowns[drawdowns.length - 1] = drawdowns[drawdowns.length - 1] + trade.result;
      } else {
        drawdowns.push(trade.result);
      }
      prevIsLoosing = true;

      if (result.biggestLost > trade.result) {
        result.biggestLost = trade.result;
      }
      result.loosingCount++;
      result.avgLostPerTrade += trade.result;
    } else {
      prevIsLoosing = false;
    }
    result.totalReturn += trade.result;
    count++;
  }

  if (result.executedTrades > 0) {
    result.avgGainLossPerTrade = result.totalReturn / result.executedTrades;
    result.winningPercent = (result.winnignCount / result.executedTrades) * 100;
    result.loosingPercent = (result.loosingCount / result.executedTrades) * 100;
    result.resultWithUSD = 1000 * (1 + result.totalReturn / 100);
  }
  if (result.loosingCount > 0) {
    result.winLossRatio = result.winnignCount / result.loosingCount;
  } else if (result.winnignCount > 0) {
    result.winLossRatio = 1;
  }
  if (result.winnignCount > 0) {
    result.avgWinPerTrade = result.avgWinPerTrade / result.winnignCount;
  }
  if (result.loosingCount > 0) {
    result.avgLostPerTrade = result.avgLostPerTrade / result.loosingCount;
  }

  for (let i = 0; i < drawdowns.length; i++) {
    if (drawdowns[i] < result.maxDrawdown) {
      result.maxDrawdown = drawdowns[i];
    }
  }
  return [result, trades];
}

module.exports = {
  executeBacktest: executeBacktest,
  cancelBacktest: cancelBacktest
}
