//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
const checkTradeRules = require('./indicators.js').checkTradeRules
const Binance = require('node-binance-api');

let feeRate = 0.1;
let running = true;
let statusSent = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }

  lock() {
    return new Promise((resolve, reject) => {
      if (this.locked) {
        this.queue.push([resolve, reject]);
      } else {
        this.locked = true;
        resolve();
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const [resolve, reject] = this.queue.shift();
      resolve();
    } else {
      this.locked = false;
    }
  }
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

self.addEventListener('message', function(e) {
  try {
    if (typeof e.data === 'string' && e.data === ('stop')) {
      running = false;
      return;
    } else if (typeof e.data === 'string' && e.data === ('resume')) {
      statusSent = false;
      running = true;
      return;
    }

    let trades = [];
    let execution = e.data[0];
    let apiKey = e.data[1];
    let apiSecret = e.data[2];
    let strategy = execution.strategy;
    let testMode = true;
    if (execution.type === 'Trading') {
      testMode = false;
    }

    const binance = new Binance().options({
      APIKEY: apiKey, APISECRET: apiSecret, useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
      test: testMode // If you want to use sandbox mode where orders are simulated
    });

    let tradeType = 'buy';
    let stoploss = Number.MIN_VALUE;
    let target = Number.MAX_VALUE;
    let tickIndex = 0;
    let buySentIndex = -1;
    let sellSentIndex = -1;
    const mutex = new Mutex();
    binance.websockets.chart(execution.instrument, execution.timeframe, async (symbol, interval, chart) => {
      if (!running) {
        return;
      }
      try {
        await mutex.lock();
        if (!statusSent) {
          let tickTmp = binance.last(chart);
          if (chart[tickTmp] === undefined) {
            running = false;
            self.postMessage('stopped');
            return;
          }
          const last = Number.parseFloat(chart[tickTmp].close);
          if (!isNaN(last)) {
            self.postMessage('started');
            statusSent = true;
          }
        }
        tickIndex++;
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
        if (execution.type === 'Alerts') {
          if (checkTradeRules(strategy.buyRules, closePrices, curPrice)) {
            let bidAsk = await getBidAsk(binance, execution.instrument);
            if (isNaN(bidAsk[1])) {
              //try once again after 0.5 sec
              await sleep(500);
              bidAsk = await getBidAsk(binance, execution.instrument);
            }
            if (!isNaN(bidAsk[1]) && checkTradeRules(strategy.buyRules, closePrices, bidAsk[1])) {
              //To ensure only one post message when rules are met
              if (tickIndex === buySentIndex + 1) {
                buySentIndex = tickIndex;
                return;
              }
              buySentIndex = tickIndex;
              self.postMessage([new Date(), curPrice, 'Buy']);
            }
          }
          if (checkTradeRules(strategy.sellRules, closePrices, curPrice)) {
            let bidAsk = await getBidAsk(binance, execution.instrument);
            if (isNaN(bidAsk[1])) {
              //try once again after 0.5 sec
              await sleep(500);
              bidAsk = await getBidAsk(binance, execution.instrument);
            }
            if (!isNaN(bidAsk[0]) && checkTradeRules(strategy.sellRules, closePrices, bidAsk[0])) {
              //To ensure only one post message when rules are met
              if (tickIndex === sellSentIndex + 1) {
                sellSentIndex = tickIndex;
                return;
              }
              sellSentIndex = tickIndex;
              self.postMessage([new Date(), curPrice, 'Sell']);
            }
          }
        } else {
          if (tradeType === 'buy') {
            if (checkTradeRules(strategy.buyRules, closePrices, curPrice)) {
              //Try if the rules are met with the price that is possible to trade with - the ask price.
              let bidAsk = await getBidAsk(binance, execution.instrument);
              if (isNaN(bidAsk[1])) {
                //try once again after 0.5 sec
                await sleep(500);
                bidAsk = await getBidAsk(binance, execution.instrument);
              }
              if (!isNaN(bidAsk[1])) {
                let buyMet = true;
                if (bidAsk[1] !== curPrice) {
                  buyMet = checkTradeRules(strategy.buyRules, closePrices, bidAsk[1]);
                  curPrice = bidAsk[1];
                }
                if (buyMet) {
                  //get ask price and try again
                  let trade = {
                    'openDate': new Date(),
                    'entry': curPrice,
                    'result': 0
                  };

                  if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
                    stoploss = curPrice * (1 - (strategy.stoploss / 100));
                  }
                  if (strategy.target !== null && !isNaN(strategy.target)) {
                    target = curPrice * (1 + (strategy.target / 100));
                  }
                  let tradeIndex = trades.length;
                  trades.push(trade);
                  tradeType = 'sell'
                  self.postMessage([trade, 'Buy', tradeIndex, feeRate]);

                  if (execution.type === 'Trading') {
                    binance.marketBuy(execution.instrument, execution.positionSize, (error, response) => {
                      if (error !== null) {
                        self.postMessage([
                          'Error buying ' + execution.positionSize + ' ' + execution.instrument + '<br>Message from exchange: ' + JSON.parse(error.body).msg,
                          'Error'
                        ]);
                      } else {
                        binance.trades(execution.instrument, (error, tradesTmp, symbol) => {
                          for (let i = tradesTmp.length - 1; i >= 0; i--) {
                            if (tradesTmp[i].orderId == response.orderId) {
                              if (tradesTmp[i].commissionAsset !== 'BNB') {
                                feeRate = 0.2;
                              }
                              let tradePrice = Number.parseFloat(tradesTmp[i].price);
                              if (tradePrice !== curPrice) {
                                trades[tradeIndex].entry = tradePrice;
                                self.postMessage([tradePrice, 'UpdateOpenPrice', tradeIndex, feeRate]);
                              }
                              break;
                            }
                          }
                        });
                      }
                    });
                  }
                }
              }
            }
          } else {
            let executeRealTrade = false;
            let tradeIndex = trades.length - 1;
            if (stoploss >= curPrice || target <= curPrice) {
              executeRealTrade = true;
              trades[tradeIndex]['closeDate'] = new Date();
              trades[tradeIndex]['exit'] = curPrice;
              tradeType = 'buy';
              self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
            } else if (checkTradeRules(strategy.sellRules, closePrices, curPrice)) {
              let bidAsk = await getBidAsk(binance, execution.instrument);
              if (isNaN(bidAsk[0])) {
                //try once again after 0.5 sec
                await sleep(500);
                bidAsk = await getBidAsk(binance, execution.instrument);
              }
              if (!isNaN(bidAsk[0])) {
                let sellMet = true;
                if (bidAsk[0] !== curPrice) {
                  sellMet = checkTradeRules(strategy.sellRules, closePrices, bidAsk[0]);
                  curPrice = bidAsk[0];
                }
                if (sellMet) {
                  executeRealTrade = true;
                  trades[tradeIndex]['closeDate'] = new Date();
                  trades[tradeIndex]['exit'] = curPrice;
                  tradeType = 'buy';
                  self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
                }
              }
            }
            if (executeRealTrade && execution.type === 'Trading') {
              binance.marketSell(execution.instrument, execution.positionSize, (error, response) => {
                if (error !== null) {
                  self.postMessage([
                    'Error selling ' + execution.positionSize + ' ' + execution.instrument + '<br>Message from exchange: ' + JSON.parse(error.body).msg,
                    'Error'
                  ]);
                } else {
                  binance.trades(execution.instrument, (error, tradesTmp, symbol) => {
                    for (let i = tradesTmp.length - 1; i >= 0; i--) {
                      if (tradesTmp[i].orderId == response.orderId) {
                        let tradePrice = Number.parseFloat(tradesTmp[i].price);
                        self.postMessage([tradePrice, 'UpdateClosePrice', tradeIndex, feeRate]);
                        break;
                      }
                    }
                  });
                }
              });
            }
          }
        }
      } catch (err) {
        self.postMessage('ERR:' + err);
      } finally {
        mutex.release();
      }
    });

  } catch (err) {
    self.postMessage('ERR1:' + err);
  }
}, false);
