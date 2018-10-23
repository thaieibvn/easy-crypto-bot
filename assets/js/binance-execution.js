//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
const checkTradeRules = require('./indicators.js').checkTradeRules
const Binance = require('node-binance-api');
const Mutex = require('./mutex.js').Mutex

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getBidAsk(binance, pair) {
  return new Promise((resolve, reject) => {
    binance.depth(pair, (error, depth, symbol) => {
      let bids = binance.sortBids(depth.bids);
      let asks = binance.sortAsks(depth.asks);
      resolve([
        Number.parseFloat(binance.first(bids)),
        Number.parseFloat(binance.first(asks))
      ]);
    });
  });
}

function getOrderTradePrice(binance, instrument, orderId) {
  return new Promise((resolve, reject) => {
    binance.trades(instrument, (error, tradesTmp, symbol) => {
      for (let i = tradesTmp.length - 1; i >= 0; i--) {
        if (tradesTmp[i].orderId == orderId) {
          if (tradesTmp[i].commissionAsset !== 'BNB') {
            feeRate = 0.2;
          }
          resolve(Number.parseFloat(tradesTmp[i].price));
          return;
        }
      }
    })
  });
}

function marketBuy(binance, execution, strategy) {
  return new Promise((resolve, reject) => {
    binance.marketBuy(execution.instrument, execution.positionSize, async (error, response) => {
      if (error !== null) {
        self.postMessage([
          execId, 'ERROR', 'Error buying ' + execution.positionSize + ' ' + execution.instrument + '<br>Message from exchange: ' + JSON.parse(error.body).msg
        ]);
        resolve(false);
      } else {
        let tradePrice = await getOrderTradePrice(binance, execution.instrument, response.orderId);
        let trade = {
          'openDate': new Date(),
          'entry': tradePrice,
          'result': 0
        };
        execution.trades.push(trade);
        self.postMessage([execId, 'BUY', trade]);
        resolve(true);
      }
    });
  });
}
function marketSell(binance, execution) {
  return new Promise((resolve, reject) => {
    binance.marketSell(execution.instrument, execution.positionSize, async (error, response) => {
      if (error !== null) {
        self.postMessage([
          execId, 'ERROR', 'Error selling ' + execution.positionSize + ' ' + execution.instrument + '<br>Message from exchange: ' + JSON.parse(error.body).msg
        ]);
        resolve(false);
      } else {
        let tradePrice = await getOrderTradePrice(binance, execution.instrument, response.orderId);
        let tradeIndex = execution.trades.length - 1;
        execution.trades[tradeIndex]['closeDate'] = new Date();
        execution.trades[tradeIndex]['exit'] = tradePrice;
        execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - feeRate;
        self.postMessage([execId, 'SELL', execution.trades[tradeIndex], feeRate]);
        resolve(true);
      }
    })
  });
}

function startBinanceWebsocket() {
  binance.websockets.chart(execution.instrument, execution.timeframe, async (symbol, interval, chart) => {
    try {
      await mutex.lock();
      let lastDate = binance.last(chart);
      if (chart[lastDate] === undefined) {
        self.postMessage([execId, 'ERROR', 'Connection to Binance lost. Check Binance website for maintenance and try executing your strategy later.']);
        return;
      }

      if (!statusSent) {
        self.postMessage([execId, 'STARTED']);
        statusSent = true;
      }
      self.postMessage([execId, 'LAST_UPDATED']);
      let curDate = new Date(Number.parseFloat(lastDate));
      let closePrices = [];
      Object.keys(chart).forEach(function(key) {
        try {
          let close = Number.parseFloat(chart[key].close);
          if (!isNaN(close)) {
            closePrices.push(close);
          }
        } catch (err) {}
      });
      let curPrice = closePrices.pop();

      if (lastDate !== lastCheckedData) {
        //New candle, so check trading rules
        lastCheckedData = lastDate;
        if (!firstCande) {
          if (execution.type === 'Alerts') {
            if (alertType === 'buy') {
              if (checkTradeRules(strategy.buyRules, closePrices)) {
                alertType = 'sell';
                self.postMessage([execId, 'BUY', curPrice, new Date()]);
              }
            } else {
              if (checkTradeRules(strategy.sellRules, closePrices)) {
                alertType = 'buy';
                self.postMessage([execId, 'SELL', curPrice, new Date()]);
              }
            }
          } else {

            if (tradeType === 'buy') {
              if (checkTradeRules(strategy.buyRules, closePrices)) {
                //Should buy at market
                if (execution.type === 'Simulation') {
                  //Get current ASK price and use it as a trade entry.
                  for (let i = 0; i < 10; i++) {
                    //There may not be ASK price at the moment. Try 10 times to find one.
                    let bidAsk = await getBidAsk(binance, execution.instrument);
                    if (isNaN(bidAsk[1])) {
                      await sleep(100);
                    } else {
                      curPrice = bidAsk[1];
                      break;
                    }
                  }
                  if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
                    stoploss = curPrice * (1 - (strategy.stoploss / 100));
                  }
                  if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl)) {
                    trailingSlPriceUsed = curPrice;
                    stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
                    self.postMessage([execId, 'TRAILING_STOP_PRICE', trailingSlPriceUsed]);
                  }
                  if (strategy.target !== null && !isNaN(strategy.target)) {
                    target = curPrice * (1 + (strategy.target / 100));
                  }
                  let trade = {
                    'openDate': new Date(),
                    'entry': curPrice,
                    'result': 0
                  };
                  execution.trades.push(trade);
                  self.postMessage([execId, 'BUY', trade]);
                } else {
                  //Real trading - market buy
                  let marketBuyOk = await marketBuy(binance, execution, strategy);
                  if (!marketBuyOk) {
                    return;
                  }
                  if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
                    stoploss = execution.trades[execution.trades.length - 1].entry * (1 - (strategy.stoploss / 100));
                  }
                  if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl)) {
                    trailingSlPriceUsed = execution.trades[execution.trades.length - 1].entry;
                    stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
                    self.postMessage([execId, 'TRAILING_STOP_PRICE', trailingSlPriceUsed]);
                  }
                  if (strategy.target !== null && !isNaN(strategy.target)) {
                    target = execution.trades[execution.trades.length - 1].entry * (1 + (strategy.target / 100));
                  }
                } //Real trading - market buy
                tradeType = 'sell';
                return;
              } //checkTradeRules - buyRules
            } else {
              // tradeType === 'sell'
              if (checkTradeRules(strategy.sellRules, closePrices)) {
                if (execution.type === 'Simulation') {
                  //Get current BID price and use it as a trade exit.
                  for (let i = 0; i < 10; i++) {
                    //There may not be BID price at the moment. Try 10 times to find one
                    let bidAsk = await getBidAsk(binance, execution.instrument);
                    if (isNaN(bidAsk[0])) {
                      await sleep(100);
                    } else {
                      curPrice = bidAsk[0];
                      break;
                    }
                  }
                  let tradeIndex = execution.trades.length - 1;
                  execution.trades[tradeIndex]['closeDate'] = new Date();
                  execution.trades[tradeIndex]['exit'] = curPrice;
                  execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - feeRate;
                  self.postMessage([execId, 'SELL', execution.trades[tradeIndex], feeRate]);
                } else {
                  await marketSell(binance, execution);
                }
                tradeType = 'buy';
                return;
              } //checkTradeRules - sellRules
            } // tradeType === 'sell'
          } //Simulation and Real Trading
        } else {
          firstCande = false;
        }
      } // if (lastDate !== lastCheckedData)

      //Same candle check only stoploss and target
      if (tradeType === 'sell') {
        if (execution.type !== 'Alerts') {
          if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl) && trailingSlPriceUsed !== -1 && trailingSlPriceUsed < curPrice) {
            trailingSlPriceUsed = curPrice;
            stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
            self.postMessage([execId, 'TRAILING_STOP_PRICE', trailingSlPriceUsed]);
          }
          //Get current BID price and use it as a trade exit.
          for (let i = 0; i < 10; i++) {
            //There may not be BID price at the moment. Try 10 times to find one
            let bidAsk = await getBidAsk(binance, execution.instrument);
            if (isNaN(bidAsk[0])) {
              await sleep(100);
            } else {
              curPrice = bidAsk[0];
              break;
            }
          }
          if ((stoploss !== null && stoploss >= curPrice) || (target !== null && target <= curPrice)) {
            if (execution.type === 'Simulation') {
              let tradeIndex = execution.trades.length - 1;
              execution.trades[tradeIndex]['closeDate'] = new Date();
              execution.trades[tradeIndex]['exit'] = curPrice;
              execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - feeRate;
              self.postMessage([execId, 'SELL', execution.trades[tradeIndex], feeRate]);
            } else {
              await marketSell(binance, execution);
            }
            tradeType = 'buy';
          }
        }
      }
    } catch (err) {
      self.postMessage([execId, 'ERROR', err]);
    } finally {
      mutex.release();
    }
  });
}

let binance = null;
let execution = null;
let apiKey = null;
let apiSecret = null;
let strategy = null;
let testMode = true;
let tradeType = 'buy';
let stoploss = null;
let target = null;
let trailingSlPriceUsed = -1;
let alertType = 'buy';
let feeRate = 0.15;
let statusSent = false;
let execId = null;
let mutex = new Mutex();
let lastCheckedData = -1;
let firstCande = true; // skip the first candle

self.addEventListener('message', async function(e) {
  try {
    if (typeof e.data === 'string' && e.data === ('PAUSE')) {
      binance.websockets.terminate(execution.instrument.toLowerCase() + '@kline_' + execution.timeframe);
      return;
    }
    if (typeof e.data === 'string' && e.data === ('TERMINATE')) {
      binance.websockets.terminate(execution.instrument.toLowerCase() + '@kline_' + execution.timeframe);
      //Reset to deaults
      binance = null;
      execution = null;
      apiKey = null;
      apiSecret = null;
      strategy = null;
      testMode = true;
      tradeType = 'buy';
      stoploss = null;
      target = null;
      trailingSlPriceUsed = -1;
      alertType = 'buy';
      feeRate = 0.15;
      statusSent = false;
      execId = null;
      mutex = new Mutex();
      lastCheckedData = -1;
      firstCande = true;
      return;
    } else if (typeof e.data === 'string' && e.data === ('RESUME')) {
      statusSent = false;
      startBinanceWebsocket();
      return;
    }
    //Initialize
    execution = e.data[0];
    apiKey = e.data[1];
    apiSecret = e.data[2];
    execId = execution.id;
    strategy = execution.strategy;
    if (execution.type === 'Trading') {
      testMode = false;
    }

    binance = new Binance().options({APIKEY: apiKey, APISECRET: apiSecret, useServerTime: true, test: testMode});

    if (execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].exit === undefined || execution.trades[execution.trades.length - 1].exit === null)) {
      tradeType = 'sell';
      if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
        stoploss = execution.trades[execution.trades.length - 1].entry * (1 - (strategy.stoploss / 100));
      }
      if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl)) {
        if (execution.trailingSlPriceUsed !== undefined && execution.trailingSlPriceUsed !== null) {
          trailingSlPriceUsed = execution.trailingSlPriceUsed;
          stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
        } else {
          trailingSlPriceUsed = execution.trades[execution.trades.length - 1].entry;
          stoploss = trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
        }
      }
      if (strategy.target !== null && !isNaN(strategy.target)) {
        target = execution.trades[execution.trades.length - 1].entry * (1 + (strategy.target / 100));
      }
    }
    startBinanceWebsocket();
  } catch (err) {
    self.postMessage([execId, 'ERROR', err]);
  }
}, false);
