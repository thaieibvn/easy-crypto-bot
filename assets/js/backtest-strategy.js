//EasyCryptoBot Copyright (C) 2018 Stefan Hristov

const smallNumber = 0.00001;
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

let cancelBtExecution = false;
function cancelBacktest() {
  cancelBtExecution = true;
}

async function executeBacktest(strategy, ticks, timeframe, startDate, useSleep) {
  cancelBtExecution = false;
  let feeRate = 0.15;
  let trades = [];
  let tradeType = 'buy';
  let stoploss = Number.MIN_VALUE;
  let target = Number.MAX_VALUE;
  let trailingSlPriceUsed = -1;
  let closePrices = [];

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
    let date = ticks[i].d;
    if (tradeType === 'buy') {
      if (checkTradeRules(strategy.buyRules, closePrices)) {
        //let openWithSpread = addBuySpread(openPrice);
        let trade = {
          'openDate': date,
          'openDateOrg': date,
          'entry': openPrice,
          /*'entry': openWithSpread > highPrice
            ? highPrice
            : openWithSpread,*/
          'result': 0
        };
        if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
          stoploss = trade.entry * (1 - (strategy.stoploss / 100))
        }
        if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl)) {
          trailingSlPriceUsed = trade.entry;
          stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100))
        }
        if (strategy.target !== null && !isNaN(strategy.target)) {
          target = trade.entry * (1 + (strategy.target / 100))
        }
        trades.push(trade);
        tradeType = 'sell'
      }
    }

    if (tradeType === 'sell') {
      if (stoploss >= lowPrice) {
        trades[trades.length - 1]['closeDate'] = date;
        trades[trades.length - 1]['closeDateOrg'] = date;
        if (openPrice < smallNumber) {
          if (stoploss >= openPrice) {
            let openWithSpread = addSellSpread(openPrice);
            trades[trades.length - 1]['exit'] = openWithSpread < lowPrice
              ? lowPrice
              : openWithSpread;
          } else if (stoploss >= closePrice) {
            let closeWithSpread = addSellSpread(closePrice);
            trades[trades.length - 1]['exit'] = closeWithSpread < lowPrice
              ? lowPrice
              : closeWithSpread;
          } else {
            trades[trades.length - 1]['exit'] = lowPrice
          }
        } else {
          trades[trades.length - 1]['exit'] = stoploss > openPrice
            ? openPrice
            : stoploss;
        }
        trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
        tradeType = 'buy';
        if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl) && trailingSlPriceUsed !== -1 && trailingSlPriceUsed < highPrice) {
          trailingSlPriceUsed = highPrice;
          stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
        }
        closePrices.push(closePrice);
        continue;
      }
      if (target <= highPrice) {
        trades[trades.length - 1]['closeDate'] = date;
        trades[trades.length - 1]['closeDateOrg'] = date;
        if (openPrice < smallNumber) {
          if (target <= openPrice) {
            let openWithSpread = addSellSpread(openPrice);
            trades[trades.length - 1]['exit'] = openWithSpread < lowPrice
              ? lowPrice
              : openWithSpread;
          } else if (target <= closePrice) {
            let closeWithSpread = addSellSpread(closePrice);
            trades[trades.length - 1]['exit'] = closeWithSpread < lowPrice
              ? lowPrice
              : closeWithSpread;
          } else {
            trades[trades.length - 1]['exit'] = lowPrice
          }
        } else {
          trades[trades.length - 1]['exit'] = target < openPrice
            ? openPrice
            : target;
        }

        trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
        tradeType = 'buy';
        if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl) && trailingSlPriceUsed !== -1 && trailingSlPriceUsed < highPrice) {
          trailingSlPriceUsed = highPrice;
          stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
        }
        closePrices.push(closePrice);
        continue;
      }
      if (strategy.sellRules.length === 0) {
        if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl) && trailingSlPriceUsed !== -1 && trailingSlPriceUsed < highPrice) {
          trailingSlPriceUsed = highPrice;
          stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
        }
        closePrices.push(closePrice);
        continue;
      }
      if (checkTradeRules(strategy.sellRules, closePrices)) {
        //let openWithSpread = addSellSpread(openPrice);
        trades[trades.length - 1]['closeDate'] = date;
        trades[trades.length - 1]['closeDateOrg'] = date;
        trades[trades.length - 1]['exit'] = openPrice;
        /*trades[trades.length - 1]['exit'] = openWithSpread < lowPrice
          ? lowPrice
          : openWithSpread;*/
        trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
        tradeType = 'buy';
      }

    }
    if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl) && trailingSlPriceUsed !== -1 && trailingSlPriceUsed < highPrice) {
      trailingSlPriceUsed = highPrice;
      stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
    }
    closePrices.push(closePrice);
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
  return [result, trades, lastTrade];
}

module.exports = {
  executeBacktest: executeBacktest,
  cancelBacktest: cancelBacktest
}
