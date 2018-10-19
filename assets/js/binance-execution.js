//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
const checkTradeRules = require('./indicators.js').checkTradeRules
const Binance = require('node-binance-api');
const Mutex = require('./mutex.js').Mutex

let feeRate = 0.1;
let running = true;
let statusSent = false;

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

async function getBidPrice(curPrice, binance, instrument) {
  for (let i = 0; i < 10; i++) {
    let bidAsk = await getBidAsk(binance, instrument);
    if (isNaN(bidAsk[0])) {
      await sleep(100);
    } else {
      curPrice = bidAsk[0];
      break;
    }
  }
  return curPrice;
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

    let execution = e.data[0];
    let apiKey = e.data[1];
    let apiSecret = e.data[2];
    let trades = e.data[3];
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

    if (trades.length > 0 && trades[trades.length - 1].exit === undefined && trades[trades.length - 1].exit === null) {
      tradeType = 'sell';
      if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
        stoploss = trades[trades.length - 1].entry * (1 - (strategy.stoploss / 100));
      }
      if (strategy.target !== null && !isNaN(strategy.target)) {
        target = trades[trades.length - 1].entry * (1 + (strategy.target / 100));
      }
    }
    let firstCande = true;
    let alertType = 'buy';
    const mutex = new Mutex();
    let lastCheckedData = -1;


    binance.websockets.chart(execution.instrument, execution.timeframe, async (symbol, interval, chart) => {
      if (!running) {
        return;
      }
      try {
        await mutex.lock();
        let lastDate = binance.last(chart);
        let curDate = new Date(Number.parseFloat(lastDate));
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
        self.postMessage('LastUpdated');
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
        let executeRealCloseTrade = false;
        if (lastDate !== lastCheckedData) {
          lastCheckedData = lastDate;
          if (!firstCande) {
            //check rules here
            if (execution.type === 'Alerts') {
              if (alertType === 'buy') {
                if (checkTradeRules(strategy.buyRules, closePrices)) {
                  alertType = 'sell';
                  self.postMessage([new Date(), curPrice, 'Buy']);
                }
              } else {
                if (checkTradeRules(strategy.sellRules, closePrices)) {
                  alertType = 'buy';
                  self.postMessage([new Date(), curPrice, 'Sell']);
                }
              }
            } else {
              //Real and simulation mod
              if (tradeType === 'buy') {
                if (checkTradeRules(strategy.buyRules, closePrices)) {

                  for (let i = 0; i < 5; i++) {
                    let bidAsk = await getBidAsk(binance, execution.instrument);
                    if (isNaN(bidAsk[1])) {
                      await sleep(100);
                    } else {
                      curPrice = bidAsk[1];
                      break;
                    }
                  }
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

                                if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
                                  stoploss = tradePrice * (1 - (strategy.stoploss / 100));
                                }
                                if (strategy.target !== null && !isNaN(strategy.target)) {
                                  target = tradePrice * (1 + (strategy.target / 100));
                                }
                              }
                              break;
                            }
                          }
                        });
                      }
                    });
                  }
                }
              } else {
                curPrice = await getBidPrice(curPrice, binance, execution.instrument);
                if (stoploss >= curPrice || target <= curPrice) {
                  let tradeIndex = trades.length - 1;
                  executeRealCloseTrade = true;
                  trades[tradeIndex]['closeDate'] = new Date();
                  trades[tradeIndex]['closeDateOrg'] = curDate;
                  trades[tradeIndex]['exit'] = curPrice;
                  trades[tradeIndex]['result'] = (((trades[tradeIndex].exit - trades[tradeIndex].entry) / trades[tradeIndex].entry) * 100) - feeRate;
                  tradeType = 'buy';

                  self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
                } else if (checkTradeRules(strategy.sellRules, closePrices)) {
                  let tradeIndex = trades.length - 1;
                  executeRealCloseTrade = true;
                  trades[tradeIndex]['closeDate'] = new Date();
                  trades[tradeIndex]['closeDateOrg'] = curDate;
                  trades[tradeIndex]['exit'] = curPrice;
                  trades[tradeIndex]['result'] = (((trades[tradeIndex].exit - trades[tradeIndex].entry) / trades[tradeIndex].entry) * 100) - feeRate;
                  tradeType = 'buy';
                  self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
                }

              }
            }
          } else {
            firstCande = false;
          }

        } else {
          curPrice = await getBidPrice(curPrice, binance, execution.instrument);
          if (tradeType === 'sell' && (stoploss >= curPrice || target <= curPrice)) {
            let tradeIndex = trades.length - 1;
            executeRealCloseTrade = true;
            trades[tradeIndex]['closeDate'] = new Date();
            trades[tradeIndex]['closeDateOrg'] = curDate;
            trades[tradeIndex]['exit'] = curPrice;
            trades[tradeIndex]['result'] = (((trades[tradeIndex].exit - trades[tradeIndex].entry) / trades[tradeIndex].entry) * 100) - feeRate;
            tradeType = 'buy';
            self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
          }
        }

        if (executeRealCloseTrade && execution.type === 'Trading') {
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
                    if (tradePrice !== curPrice) {
                      let tradeIndex = trades.length - 1;
                      trades[tradeIndex].exit = tradePrice;
                      self.postMessage([tradePrice, 'UpdateClosePrice', tradeIndex, feeRate]);
                    }
                    break;
                  }
                }
              });
            }
          });
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
