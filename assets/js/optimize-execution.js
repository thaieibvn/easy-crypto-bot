//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
const checkTradeRules = require('./indicators.js').checkTradeRules
const Mutex = require('./mutex.js').Mutex
const getTimeframes = require('./utils.js').getTimeframes
const getEndPeriod = require('./utils.js').getEndPeriod
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
let feeRate = 0.075;
self.addEventListener('message', async function(e) {
  try {
    //await mutex.lock();
    if (typeof e.data[0] === 'string' && e.data[0].startsWith('INITIALIZE')) {
      id = e.data[1]
      timeframe = e.data[2];
      startDate = e.data[3];
      ticks = e.data[4];
      feeRate = e.data[5];
      opExecutionCanceled = false;
      self.postMessage(['STARTED', id]);
    } else if (typeof e.data[0] === 'string' && e.data[0].startsWith('STOP')) {
      opExecutionCanceled = true;
      cancelBacktest();
      while (isRunning) {
        await sleep(500)
      }
      let ticks = null;
      let timeframe = null;
      let startDate = null;
      self.postMessage(['STOPPED', id]);
      //await sleep(2000)
      //self.close();
    } else if (typeof e.data[0] === 'string' && e.data[0].startsWith('STRATEGY')) {
      if (ticks === null || opExecutionCanceled) {
        self.postMessage('ERR: Worker Stopped or Not Initialized!');
        return;
      }
      isRunning = true;
      let strategy = e.data[1];
      let result = await executeBacktest(strategy, ticks, startDate, false, feeRate * 2)
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
    self.postMessage('ERR: ' + err.stack);
  } finally {
    //mutex.release();
  }

}, false);
