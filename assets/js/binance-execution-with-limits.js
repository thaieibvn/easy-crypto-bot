//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
const checkTradeRules = require('./indicators.js').checkTradeRules
const Binance = require('node-binance-api');
const Mutex = require('./mutex.js').Mutex

let feeRate = 0.15;
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

function cancelOrder(binance, instrument, orderId) {
  if (orderId === null || orderId === undefined) {
    return;
  }
  return new Promise((resolve, reject) => {
    binance.cancel(instrument, orderId, (error, response, symbol) => {
      resolve(response);
    });
  });
}

function orderStatus(binance, instrument, orderId) {
  if (orderId === null || orderId === undefined) {
    return;
  }
  return new Promise((resolve, reject) => {
    binance.orderStatus(instrument, orderId, (error, orderStatus, symbol) => {
      resolve(orderStatus);
    })
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

async function checkExitOrderWasFilled(binance, instrument, orderId, orderToCancel, trades) {
  if (orderId === null || orderId === undefined) {
    return false;
  }
  let status = await orderStatus(binance, instrument, orderId);
  if (status.status === 'FILLED') {
    if (orderToCancel !== null) {
      await cancelOrder(binance, instrument, orderToCancel);
    }

    let tradePrice = await getOrderTradePrice(binance, instrument, orderId);
    let tradeIndex = trades.length - 1;
    trades[tradeIndex]['closeDate'] = new Date();
    trades[tradeIndex]['exit'] = tradePrice;
    trades[tradeIndex]['result'] = (((trades[tradeIndex].exit - trades[tradeIndex].entry) / trades[tradeIndex].entry) * 100) - feeRate;
    self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
    return true;
  }
  return false;
}

function placeStoplossLimit(binance, execution, stoploss) {
  return new Promise((resolve, reject) => {
    binance.sell(execution.instrument, execution.positionSize, stoploss, {
      stopPrice: stoploss,
      type: "STOP_LOSS_LIMIT"
    }, async (error, response) => {
      if (error) {
        self.postMessage([
          'Error placing STOP_LOSS_LIMIT order! Maybe the position size of ' + execution.positionSize + ' is under the Binance minimum requirement for instrument ' + execution.instrument + + '<br>Please take in mind that the strategy has bought and didn\'t sell. Now you can to manually sell the ammount on the Binance exchenge.'
          + '<br><br> '+ JSON.stringify(error),
          'Error'
        ]);
        resolve(null);
      }
      resolve(response.orderId);
    });
  });
}

function placeTakeProfitLimit(binance, execution, target) {
  return new Promise((resolve, reject) => {
    binance.sell(execution.instrument, execution.positionSize, target, {
      stopPrice: target,
      type: "TAKE_PROFIT_LIMIT"
    }, (error, response) => {
      if (error) {
        self.postMessage([
          'Error placing TAKE_PROFIT_LIMIT order! Maybe the position size of ' + execution.positionSize + ' is under the Binance minimum requirement for instrument ' + execution.instrument + '<br>Please take in mind that the strategy has bought and didn\'t sell. Now you can to manually sell the ammount on the Binance exchenge',
          'Error'
        ]);
        resolve(null);
      }
      resolve(response.orderId);
    });
  });
}
function marketBuy(binance, execution, strategy, trades) {
  return new Promise((resolve, reject) => {
    binance.marketBuy(execution.instrument, execution.positionSize, async (error, response) => {
      if (error !== null) {
        self.postMessage([
          'Error buying ' + execution.positionSize + ' ' + execution.instrument + '<br>Message from exchange: ' + JSON.parse(error.body).msg,
          'Error'
        ]);
        resolve(false);
      } else {
        let stoplossorderId = null;
        let targetorderId = null
        let tradePrice = await getOrderTradePrice(binance, execution.instrument, response.orderId);
        if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
          let stoploss = Number.parseFloat((tradePrice * (1 - (strategy.stoploss / 100))).toFixed(8));
          stoplossorderId = await placeStoplossLimit(binance, execution, stoploss);
        }
        if (strategy.target !== null && !isNaN(strategy.target)) {
          let target =  Number.parseFloat((tradePrice * (1 + (strategy.target / 100))).toFixed(8));;
          targetorderId = await placeTakeProfitLimit(binance, execution, target);
        }
        let trade = {
          'openDate': new Date(),
          'entry': tradePrice,
          'result': 0,
          'stoplossorderId': stoplossorderId,
          'targetorderId': targetorderId
        };
        trades.push(trade);
        self.postMessage([trade, 'Buy']);
        resolve(true);
      }
    });
  });
}
function marketSell(binance, execution, trades) {
  return new Promise((resolve, reject) => {
    binance.marketSell(execution.instrument, execution.positionSize, async (error, response) => {
      if (error !== null) {
        self.postMessage([
          'Error selling ' + execution.positionSize + ' ' + execution.instrument + '<br>Message from exchange: ' + JSON.parse(error.body).msg,
          'Error'
        ]);
        resolve(false);
      } else {
        let tradePrice = await getOrderTradePrice(binance, execution.instrument, response.orderId);
        let tradeIndex = trades.length - 1;
        trades[tradeIndex]['closeDate'] = new Date();
        trades[tradeIndex]['exit'] = tradePrice;
        trades[tradeIndex]['result'] = (((trades[tradeIndex].exit - trades[tradeIndex].entry) / trades[tradeIndex].entry) * 100) - feeRate;
        self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
        resolve(true);
      }
    })
  });
}

self.addEventListener('message', async function(e) {
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
    let stoploss = null;
    let target = null;
    let stoplossorderId = null;
    let targetorderId = null;

    if (trades.length > 0 && (trades[trades.length - 1].exit === undefined || trades[trades.length - 1].exit === null)) {
      tradeType = 'sell';
      if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
        stoploss = trades[trades.length - 1].entry * (1 - (strategy.stoploss / 100));
        if (execution.type === 'Trading') {
          stoplossorderId = trades[trades.length - 1].stoplossorderId;
          self.postMessage('MSG stoplossorderId: ' + stoplossorderId);
        }
      }
      if (strategy.target !== null && !isNaN(strategy.target)) {
        target = trades[trades.length - 1].entry * (1 + (strategy.target / 100));
        if (execution.type === 'Trading') {
          targetorderId = trades[trades.length - 1].targetorderId;
        }
      }
      //Check if an order were executed on Binance
      let executedStoploss = await checkExitOrderWasFilled(binance, execution.instrument, stoplossorderId, targetorderId, trades);
      if (executedStoploss) {
        tradeType = 'buy';
      }
      let executedTarget = await checkExitOrderWasFilled(binance, execution.instrument, targetorderId, stoplossorderId, trades);
      if (executedTarget) {
        tradeType = 'buy';
      }
      if (executedStoploss && executedTarget) {
        //While the app was shut down bot orders were execute on Binance!
      }
    }
    let alertType = 'buy';
    const mutex = new Mutex();
    let lastCheckedData = -1;
    let firstCande = true; // skip the first candle

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

        if (lastDate !== lastCheckedData) {
          //New candle, so check trading rules
          lastCheckedData = lastDate;
          if (!firstCande) {
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
              //Simulation and Real Trading

              //Check if an order were executed on Binance
              let executedStoploss = await checkExitOrderWasFilled(binance, execution.instrument, stoplossorderId, targetorderId, trades);
              if (executedStoploss) {
                tradeType = 'buy';
              } else {
                let executedTarget = await checkExitOrderWasFilled(binance, execution.instrument, targetorderId, stoplossorderId, trades);
                if (executedTarget) {
                  tradeType = 'buy';
                }
              }

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
                    if (strategy.target !== null && !isNaN(strategy.target)) {
                      target = curPrice * (1 + (strategy.target / 100));
                    }
                    let trade = {
                      'openDate': new Date(),
                      'entry': curPrice,
                      'result': 0
                    };
                    trades.push(trade);
                    self.postMessage([trade, 'Buy']);
                  } else {
                    //Real trading - market buy
                    let marketBuyOk = await marketBuy(binance, execution, strategy, trades);
                    if (!marketBuyOk) {
                      running = false;
                      return;
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
                    let tradeIndex = trades.length - 1;
                    trades[tradeIndex]['closeDate'] = new Date();
                    trades[tradeIndex]['exit'] = curPrice;
                    trades[tradeIndex]['result'] = (((trades[tradeIndex].exit - trades[tradeIndex].entry) / trades[tradeIndex].entry) * 100) - feeRate;
                    self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
                  } else {
                    //Real trading - market sell
                    let executedStoploss = await checkExitOrderWasFilled(binance, execution.instrument, stoplossorderId, targetorderId, trades);
                    if (executedStoploss) {
                      tradeType = 'buy';
                      return;
                    } else {
                      let executedTarget = await checkExitOrderWasFilled(binance, execution.instrument, targetorderId, stoplossorderId, trades);
                      if (executedTarget) {
                        tradeType = 'buy';
                        return;
                      }
                    }
                    await cancelOrder(binance, execution.instrument, stoplossorderId);
                    await cancelOrder(binance, execution.instrument, targetorderId);
                    let marketSellOk = await marketSell(binance, execution, trades);
                    if (!marketSellOk) {
                      running = false;
                      return;
                    }
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
            if ((stoploss !== null && stoploss >= curPrice) || (target !== null && target <= curPrice)) {
              let tradeIndex = trades.length - 1;
              trades[tradeIndex]['closeDate'] = new Date();
              trades[tradeIndex]['exit'] = curPrice;
              trades[tradeIndex]['result'] = (((trades[tradeIndex].exit - trades[tradeIndex].entry) / trades[tradeIndex].entry) * 100) - feeRate;
              tradeType = 'buy';
              self.postMessage([trades[tradeIndex], 'Sell', feeRate]);
            }
          } else {
            //Real trading
            let executedStoploss = await checkExitOrderWasFilled(binance, execution.instrument, stoplossorderId, targetorderId, trades);
            if (executedStoploss) {
              tradeType = 'buy';
            } else {
              let executedTarget = await checkExitOrderWasFilled(binance, execution.instrument, targetorderId, stoplossorderId, trades);
              if (executedTarget) {
                tradeType = 'buy';
              }
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
