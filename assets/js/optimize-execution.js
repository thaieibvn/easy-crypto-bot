//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
const checkTradeRules = require('./indicators.js').checkTradeRules
const Mutex = require('./mutex.js').Mutex
const executeBacktest = require('./backtest-strategy.js').executeBacktest
const cancelBacktest = require('./backtest-strategy.js').cancelBacktest

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let ticks = null;
let timeframe = null;
let startDate = null;
let id = null;
let opExecutionCanceled = false;
const mutex = new Mutex();
let isRunning = false;
self.addEventListener('message', async function(e) {
  try {
    //await mutex.lock();
    if (typeof e.data[0] === 'string' && e.data[0].startsWith('INITIALIZE')) {
      id = e.data[1]
      timeframe = e.data[2];
      startDate = e.data[3];
      ticks = e.data[4];
      self.postMessage(['STARTED', id]);
    } else if (typeof e.data[0] === 'string' && e.data[0].startsWith('STOP')) {
      opExecutionCanceled = true;
      cancelBacktest();
      while(isRunning) {
        await sleep(500)
      }
      //await sleep(1000)
      self.close();
    } else if (typeof e.data[0] === 'string' && e.data[0].startsWith('STRATEGY')) {
      isRunning = true;
      if (ticks === null) {
        self.postMessage('ERR: Worker Not Initialized!');
        return;
      }
      let strategy = e.data[1];
      let result = await executeBacktest(strategy, ticks, timeframe, startDate, false)
      if (result !== null && !opExecutionCanceled) {
        self.postMessage([
          'RESULT', id, result[0]
        ]);
      }
      isRunning = false;
      /*if(opExecutionCanceled){
        self.close();
      }*/
    }
  } catch (err) {
    self.postMessage('ERR:' + err);
  } finally {
    //mutex.release();
  }

}, false);
