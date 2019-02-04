//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
const checkTradeRules = require('./indicators.js').checkTradeRules
const Binance = require('node-binance-api');
const Mutex = require('./mutex.js').Mutex

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getBidAsk(pair) {
  return new Promise((resolve, reject) => {
    binance.useServerTime(function() {
      binance.depth(pair, (error, depth, symbol) => {
        let bids = binance.sortBids(depth.bids);
        let asks = binance.sortAsks(depth.asks);
        resolve([
          Number.parseFloat(binance.first(bids)),
          Number.parseFloat(binance.first(asks))
        ]);
      });
    });
  });
}

function getPrecisionFromTickSize(tickSize) {
  if (tickSize === null || tickSize === undefined) {
    return 8;
  }
  let startIndex = tickSize.indexOf('.');
  let endIndex = tickSize.indexOf('1');
  if (startIndex !== -1 && endIndex !== -1) {
    return tickSize.substring(startIndex, endIndex).length;
  }
  return 8;
}

async function getBinanceInstrumentsInfo(instrument) {
  if (binanceInstrumentsInfo === null) {
    binanceInstrumentsInfo = {};
    return new Promise((resolve, reject) => {
      binance.useServerTime(function() {
        binance.exchangeInfo(function(error, data) {
          for (let obj of data.symbols) {
            let item = {};
            for (let filter of obj.filters) {
              if (filter.filterType == "MIN_NOTIONAL") {
                item.minNotional = filter.minNotional;
              } else if (filter.filterType == "LOT_SIZE") {
                item.stepSize = filter.stepSize;
                item.minQty = filter.minQty;
                item.maxQty = filter.maxQty;
              } else if (filter.filterType == "PRICE_FILTER") {
                item.tickSize = filter.tickSize;
              }
            }
            item.orderTypes = obj.orderTypes;
            item.precision = getPrecisionFromTickSize(item.tickSize);
            binanceInstrumentsInfo[obj.symbol] = item;
          }
          resolve(binanceInstrumentsInfo[instrument.toUpperCase()]);
        });
      });
    });
  } else {
    return binanceInstrumentsInfo[instrument.toUpperCase()];
  }
}

function getBalance(instrument) {
  return new Promise((resolve, reject) => {
    binance.useServerTime(function() {
      binance.balance((error, balances) => {
        if (error) {
          resolve(0);
          return;
        }
        resolve(balances[getBaseCurrency(instrument)].available);
      })
    })
  });
}

function getBaseCurrency(pair) {
  if (pair.toLowerCase().endsWith("btc")) {
    return pair.substring(0, pair.toLowerCase().lastIndexOf("btc")).toUpperCase();
  } else if (pair.toLowerCase().endsWith("eth")) {
    return pair.substring(0, pair.toLowerCase().lastIndexOf("eth")).toUpperCase();
  } else if (pair.toLowerCase().endsWith("bnb")) {
    return pair.substring(0, pair.toLowerCase().lastIndexOf("bnb")).toUpperCase();
  } else if (pair.toLowerCase().endsWith("usdt")) {
    return pair.substring(0, pair.toLowerCase().lastIndexOf("usdt")).toUpperCase();
  } else {
    return '';
  }
}
function getOrderTradePrice(execution, orderId, type) {
  return new Promise((resolve, reject) => {
    binance.useServerTime(function() {
      binance.trades(execution.instrument, async (error, tradesTmp, symbol) => {
        let qty = 0;
        let sum = 0;
        let commision = 0;
        for (let i = tradesTmp.length - 1; i >= 0; i--) {
          if (tradesTmp[i].orderId == orderId) {
            sum += Number.parseFloat(tradesTmp[i].price) * Number.parseFloat(tradesTmp[i].qty);
            qty += Number.parseFloat(tradesTmp[i].qty);
            if (tradesTmp[i].commissionAsset !== 'BNB') {
              commision += Number.parseFloat(tradesTmp[i].commission);
              feeRate = 0.2;
            }
          }
        }
        if (qty !== 0) {
          if (commision !== 0 && type === 'buy') {
            let balance = await getBalance(execution.instrument);
            if (balance < execution.positionSize) {
              let info = await getBinanceInstrumentsInfo(execution.instrument);
              //Change position size as we don't have the initial ammount to sell because of the commision
              execution.positionSize = binance.roundStep(qty - commision, info.stepSize);
              self.postMessage([execId, 'CH_POS_SIZE', execution.positionSize]);
            }
          }
          if (qty !== 0) {
            resolve([
              Number.parseFloat((sum / qty).toFixed(8)),
              qty
            ]);
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      })
    });
  });
}

function marketBuy(execution, strategy) {
  return new Promise((resolve, reject) => {
    binance.useServerTime(function() {
      binance.marketBuy(execution.instrument, execution.positionSize, async (error, response) => {
        if (error !== null) {
          self.postMessage([
            execId, 'ERROR', 'Error buying ' + execution.positionSize + ' ' + execution.instrument + '.<br>Error message from Binance: ' + JSON.parse(error.body).msg
          ]);
          resolve(false);
        } else {
          let tradePrice = await getOrderTradePrice(execution, response.orderId, 'buy');
          let trade = {
            'openDate': new Date(),
            'entry': tradePrice[0],
            'result': 0
          };
          execution.trades.push(trade);
          self.postMessage([execId, 'BUY', trade, feeRate]);
          resolve(true);
        }
      });
    });
  });
}
async function marketSell(execution) {
  await cancelOrder(execution.instrument, execution.takeProfitOrderId);
  let takeProfitExecutedQty = await checkTakeProfitExecuted();
  if (takeProfitExecutedQty === execution.positionSize) {
    return;
  }
  let positionSize = execution.positionSize - takeProfitExecutedQty;

  return new Promise((resolve, reject) => {
    binance.useServerTime(function() {
      binance.marketSell(execution.instrument, positionSize, async (error, response) => {
        if (error !== null) {
          self.postMessage([
            execId, 'ERROR', 'Error selling ' + positionSize + ' ' + execution.instrument + '.<br>Error message from Binance: ' + JSON.parse(error.body).msg
          ]);
          resolve(false);
        } else {
          let tradePrice = await getOrderTradePrice(execution, response.orderId, 'sell');
          let finalPrice = tradePrice[0];
          if (takeProfitExecutedQty !== 0) {
            let takeProfitPrice = await getOrderTradePrice(execution, execution.takeProfitOrderId, 'sell');
            finalPrice = ((takeProfitPrice[0] * takeProfitPrice[1]) + (tradePrice[0] * tradePrice[1])) / execution.positionSize;
          }
          let tradeIndex = execution.trades.length - 1;
          execution.trades[tradeIndex]['closeDate'] = new Date();
          execution.trades[tradeIndex]['exit'] = finalPrice;
          execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - feeRate;
          self.postMessage([
            execId, 'SELL', execution.trades[tradeIndex]
          ]);
          resolve(true);
        }
      })
    });
  });
}

function placeTakeProfitLimit(execution, target) {
  return new Promise(async (resolve, reject) => {
    let info = await getBinanceInstrumentsInfo(execution.instrument);
    let price = Number.parseFloat(target.toFixed(info.precision));
    binance.useServerTime(function() {
      binance.sell(execution.instrument, execution.positionSize, price, {
        type: "LIMIT"
      }, (error, response) => {
        if (error) {
          self.postMessage([
            execId, 'ERROR', 'Error placing TAKE_PROFIT_LIMIT order for instrument ' + execution.instrument + '<br>Please take in mind that the strategy has bought and hasn\'t sell. You should manually sell on Binance the ammount or place the limit take profit order.<br>Error message from Binance: ' + JSON.parse(error.body).msg
          ]);
          resolve(null);
          return;
        }
        resolve(response.orderId);
      });
    });
  });
}

function cancelOrder(instrument, orderId) {
  if (orderId === null || orderId === undefined) {
    return;
  }
  return new Promise((resolve, reject) => {
    binance.useServerTime(function() {
      binance.cancel(instrument, orderId, (error, response, symbol) => {
        resolve(response);
      });
    });
  });
}

function balanceUpdate(data) {}

async function checkTakeProfitExecuted() {
  if (execution.type !== 'Trading' || execution.takeProfitOrderId === null) {
    return;
  }
  let priceAndQty = await getOrderTradePrice(execution, execution.takeProfitOrderId, 'sell');
  if (priceAndQty === null) {
    return 0;
  }
  if (priceAndQty[1] == execution.positionSize) {
    tradeType = 'buy';

    let tradeIndex = execution.trades.length - 1;
    execution.trades[tradeIndex]['closeDate'] = new Date();
    execution.trades[tradeIndex]['exit'] = priceAndQty[0];
    execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - feeRate;
    self.postMessage([
      execId, 'SELL', execution.trades[tradeIndex]
    ]);
  }
  return priceAndQty[1];
}

async function executionUpdate(data) {
  let {
    x: executionType,
    s: symbol,
    p: price,
    q: quantity,
    S: side,
    o: orderType,
    i: orderId,
    X: orderStatus
  } = data;
  if (orderId == execution.takeProfitOrderId) {
    await checkTakeProfitExecuted();
  }
}

function startBinanceWebsocket() {
  if (execution.type === 'Trading') {
    binance.websockets.userData(balanceUpdate, executionUpdate);
  }
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
        if (execution.type === 'Trading' && tradeType === 'sell') {
          await checkTakeProfitExecuted();
        }
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
                    let bidAsk = await getBidAsk(execution.instrument);
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
                  if (strategy.timeClose !== null && !isNaN(strategy.timeClose)) {
                    timeClose = new Date(trade.openDate.getTime());
                    timeClose.setHours(timeClose.getHours() + strategy.timeClose);
                  }
                  self.postMessage([execId, 'BUY', trade, feeRate]);
                } else {
                  //Real trading - market buy
                  let marketBuyOk = await marketBuy(execution, strategy);
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
                    execution.takeProfitOrderId = await placeTakeProfitLimit(execution, target);
                    if (execution.takeProfitOrderId === null) {
                      return;
                    }
                    self.postMessage([execId, 'TAKE_PROFIT_ORDER_ID', execution.takeProfitOrderId]);
                  }
                  if (strategy.timeClose !== null && !isNaN(strategy.timeClose)) {
                    timeClose = new Date(execution.trades[execution.trades.length - 1].openDate.getTime());
                    timeClose.setHours(timeClose.getHours() + strategy.timeClose);
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
                    let bidAsk = await getBidAsk(execution.instrument);
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
                  self.postMessage([
                    execId, 'SELL', execution.trades[tradeIndex]
                  ]);
                } else {
                  await marketSell(execution);
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
            let bidAsk = await getBidAsk(execution.instrument);
            if (isNaN(bidAsk[0])) {
              await sleep(100);
            } else {
              curPrice = bidAsk[0];
              break;
            }
          }
          if ((stoploss !== null && stoploss >= curPrice) || (target !== null && target <= curPrice) || (timeClose !== null && timeClose <= new Date())) {
            if (execution.type === 'Simulation') {
              let tradeIndex = execution.trades.length - 1;
              execution.trades[tradeIndex]['closeDate'] = new Date();
              execution.trades[tradeIndex]['exit'] = curPrice;
              execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - feeRate;
              self.postMessage([
                execId, 'SELL', execution.trades[tradeIndex]
              ]);
              tradeType = 'buy';
            }
          }
          if ((stoploss !== null && stoploss >= curPrice) || (timeClose !== null && timeClose <= new Date())) {
            if (execution.type === 'Trading') {
              await marketSell(execution);
              tradeType = 'buy';
            }
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
let timeClose = null;
let trailingSlPriceUsed = -1;
let alertType = 'buy';
let feeRate = 0.15;
let statusSent = false;
let execId = null;
let mutex = new Mutex();
let lastCheckedData = -1;
let firstCande = true; // skip the first candle
let binanceInstrumentsInfo = null;

self.addEventListener('message', async function(e) {
  try {
    if (typeof e.data === 'string' && e.data === ('PAUSE')) {
      let endpoints = binance.websockets.subscriptions();
      for (let endpoint in endpoints) {
        binance.websockets.terminate(endpoint);
      }
      return;
    }
    if (typeof e.data === 'string' && e.data === ('TERMINATE')) {
      let endpoints = binance.websockets.subscriptions();
      for (let endpoint in endpoints) {
        binance.websockets.terminate(endpoint);
      }
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
      timeClose = null;
      trailingSlPriceUsed = -1;
      alertType = 'buy';
      feeRate = 0.15;
      statusSent = false;
      execId = null;
      mutex = new Mutex();
      lastCheckedData = -1;
      firstCande = true;
      binanceInstrumentsInfo = null;
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
    binance = new Binance().options({APIKEY: apiKey, APISECRET: apiSecret, useServerTime: true, recvWindow: 60000, test: testMode});

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
      if (strategy.timeClose !== null && !isNaN(strategy.timeClose)) {
        timeClose = new Date(execution.trades[execution.trades.length - 1].openDate.getTime());
        timeClose.setHours(timeClose.getHours() + strategy.timeClose);
      }
    }
    startBinanceWebsocket();
  } catch (err) {
    self.postMessage([execId, 'ERROR', err]);
  }
}, false);
