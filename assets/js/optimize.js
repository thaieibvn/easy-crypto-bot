//EasyCryptoBot Copyright (C) 2018 Stefan Hristov

async function opFillBinanceInstruments() {
  await getBinanceInstruments();
}

let opInstrumentMutex = new Mutex();
async function opInstrumentKeyup() {
  try {
    opInstrumentMutex.lock();
    $('#opInstrumentList>ul').html('');
    let instruments = null;
    if ($('#opExchangeCombobox').text() === 'Binance') {
      instruments = await getBinanceInstruments();
    } else {
      $('#opInstrumentSearch').val('');
      openModalInfo('Please Choose Exchange First!');
      return;
    }

    let lastKey = null;

    if (instruments !== null) {
      let instrumentsToAdd = '';
      let search = $('#opInstrumentSearch').val().toLowerCase();
      Object.keys(instruments).forEach(function(key) {
        if (key.toLowerCase().indexOf(search) != -1) {
          lastKey = key.toLowerCase();
          instrumentsToAdd += '<li><a href="#/"  onclick="opFillInstrument(\'' + key + '\')">' + key + '</a></li>';
        }
      });
      if (lastKey !== null && lastKey !== search) {
        $('#opInstrumentList>ul').html(instrumentsToAdd);
        $('#opInstrument>div>ul').show()
      }

    }
  } catch (err) {
    log('error', 'opInstrumentKeyup', err.stack);
  } finally {
    opInstrumentMutex.release();
  }
}

function opFillInstrument(name) {
  $('#opInstrument>div>ul').hide();
  $('#opInstrumentSearch').val(name)
}

async function getNextOpStrategy() {
  try {
    await executionOpMutex.lock();
    if (opExecutedIndex < strategyVariations.length) {
      let strategy = strategyVariations[opExecutedIndex]
      opExecutedIndex++;
      return strategy;
    } else {
      return null;
    }
  } finally {
    executionOpMutex.release();
  }
}
async function addOpResult(result) {
  try {
    await addOpResultMutex.lock();
    opCompleted++;
    if (result !== null) {
      strategyVariationsResults.push(result);
    }
    return opCompleted;
  } finally {
    addOpResultMutex.release();
  }
}

let strategyVariations = [];
let strategyVariationsTested = 0;
let fineTune = 0;
let strategyVariationsResults = [];
let strategyVariationsIntermitBestResults = [];
let opExecutionCanceled = false;
let opExecutionWorkers = {};
let opExecutedIndex = 0;
let opCompleted = 0;
let maxOpWorkers = 1;
let webWorkersInitialized = false;
let optimizationRunning = false;
let runningWorkiers = 0;
let marketReturn;
let timeframes = null
let startDate = null;
let ticks = {};
let feeRate = null;
let optType = 'return';
let changeStoploss;
let changeTarget;
let changeStoplossFine;
let changeTargetFine;
let etaLastDate = null;
let etaStr = '';
let etaLastNum = null;
let strategyNameToUse = '';
let useTrailingStop = false;
let useTrailingTarget = false;
const executionOpMutex = new Mutex();
const addOpResultMutex = new Mutex();
const opWorkerTerminateMutex = new Mutex();
const runningWorkersMutex = new Mutex();

function isOptimizationRunning() {
  return optimizationRunning;
}
async function runOptimize() {
  if (isBacktestRunning()) {
    openModalInfo('Cannot run optimization while executing backtest!');
    return;
  }
  $('#runOptBtn').addClass('disabled');
  if (hasTradingStrategies()) {
    let continueExecution = 0;
    openModalConfirm('<h3>Warning</h3><div style="text-align:justify">You have realtime strategies running under Trade & Alerts tab. It is highly recommended to pause them before using the optimization feature, as it consumes a lot of your PC resources and the realtime execution may not be executed in time!</div><br><div class="text-center">Continue anyway?</div>', function() {
      continueExecution = 1
    }, function() {
      continueExecution = -1
    });

    while (continueExecution === 0) {
      await sleep(500);
      let continueExecution = 0;
    }
    if (continueExecution === -1) {
      $('#runOptBtn').removeClass('disabled');
      return;
    }
  }

  $('#opCancelBtn').removeClass('disabled');
  let strategyName = $('#opStrategyCombobox').text();
  let exchange = $('#opExchangeCombobox').text();
  let instrument = $('#opInstrumentSearch').val().toUpperCase();
  feeRate = $('#opFeeSearch').val();
  if (strategyName === 'Choose Strategy') {
    openModalInfo('Please Choose a Strategy!');
    $('#runOptBtn').removeClass('disabled');
    return;
  }
  if (exchange === 'Choose Exchange') {
    openModalInfo('Please Choose an Exchange!');
    $('#runOptBtn').removeClass('disabled');
    return;
  }
  if (exchange === 'Binance') {
    let instruments = await getBinanceInstruments();
    if (!(instrument in instruments)) {
      openModalInfo('Invalid Instrument!<br>Please Choose an Instrument!');
      $('#runOptBtn').removeClass('disabled');
      return;
    }
  }
  if (feeRate <= 0) {
    openModalInfo('Fee rate should be a positive number!');
    $('#runOptBtn').removeClass('disabled');
    return;
  }
  let startDateStr = $('#opFromDate').val();
  let endDateStr = $('#opToDate').val();

  startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) {
    openModalInfo('Please Choose a Start Date!');
    $('#runOptBtn').removeClass('disabled');
    return;
  }
  startDate.setHours(0, 0, 0, 0);
  let endDate = new Date(endDateStr);

  if (isNaN(endDate.getTime())) {
    openModalInfo('Please Choose an End Date!');
    $('#runOptBtn').removeClass('disabled');
    return;
  }
  if (startDate >= endDate) {
    openModalInfo('Start Date must be before End Date!');
    $('#runOptBtn').removeClass('disabled');
    return;
  }
  endDate.setHours(23, 59, 59, 59);
  let endDateTmp = new Date(endDate.getTime());
  endDateTmp.setMonth(endDate.getMonth() - 3);
  endDateTmp.setDate(endDateTmp.getDate() - 1);
  if (startDate < endDateTmp) {
    openModalInfo('The maximum period is 3 months. Please change the selected dates.');
    $('#runOptBtn').removeClass('disabled');
    return;
  }

  if (startDate >= endDate) {
    openModalInfo('Start Date must be before End Date!');
    $('#runOptBtn').removeClass('disabled');
    return;
  }

  if ($('#opTypeMaxReturn').is(':checked')) {
    optType = 'return';
  } else if ($('#opTypeSmooth').is(':checked')) {
    optType = 'smooth';
  } else if ($('#opTypeRiskReward').is(':checked')) {
    optType = 'riskReward';
  }

  changeStoploss = $('#opChangeStoplossYes').is(':checked') || $('#opChangeStoplossFine').is(':checked');
  changeTarget = $('#opChangeTargetYes').is(':checked') || $('#opChangeTargetFine').is(':checked');

  changeStoplossFine = $('#opChangeStoplossFine').is(':checked');
  changeTargetFine = $('#opChangeTargetFine').is(':checked');

  try {
    optimizationRunning = true;
    opExecutionCanceled = false;
    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy!');
      $('#opStrategyCombobox').html('Choose Strategy');
      optimizationRunning = false;
      $('#runOptBtn').removeClass('disabled');
      return;
    }

    if ($('#opChangeStoplossFine').is(':checked') && (strategy.stoploss == undefined || strategy.stoploss == null || isNaN(strategy.stoploss)) && (strategy.trailingSl == undefined || strategy.trailingSl == null || isNaN(strategy.trailingSl))) {
      openModalInfo('The Fine Tune Stoploss option works only for strategies with a stoploss or a trailing stoploss.');
      optimizationRunning = false;
      $('#runOptBtn').removeClass('disabled');
      return;
    }

    if ($('#opChangeTargetFine').is(':checked') && (strategy.target == undefined || strategy.target == null || isNaN(strategy.target))) {
      openModalInfo('The Fine Tune Target option works only for strategies with a target.');
      optimizationRunning = false;
      $('#runOptBtn').removeClass('disabled');
      return;
    }

    strategyNameToUse = strategy.name + ' (' + instrument + ' Opt.)';
    $('#opRunPercent').html('Starting Optimization..');
    $('#opRunRemaining').html('&nbsp;');
    $('#opRunPercent2').hide();
    $('#opRunRocket').hide();
    $('#opCancelDiv').hide();

    $('#opRunning').show();
    $('#opResult').hide();
    $('#opResultNoTrades').hide();
    $('#opExecInfo').hide();
    $('#opResultDiv').show();
    $('#opStrategiesTable').html('<thead><tr><td>Strategy</td><td>Total Return</td><td>Max Drawdown</td><td>Winning %</td><td>Avg. Trade</td><td>Best Trade</td><td>Worst Trade</td><td>Trades N.</td><td>Save</td></tr></thead><tbody>');
    $('#opCancelDiv').show();

    timeframes = getTimeframes(strategy);
    if (timeframes === null) {
      $('#runOptBtn').removeClass('disabled');
      $('#opRunning').hide();
      $('#opResult').hide();
      openModalInfo('Your strategy contains a rule without a timeframe. Please edit your strategy!');
      optimizationRunning = false;
      return;
    }

    let fieldsToChange = calculateFieldsToChange(strategy);
    if (fieldsToChange > 20) {
      openModalInfo('Your strategy contains too many input fields (' + fieldsToChange + ') to be optimized. The maximum allowed number is 20.');
      $('#runOptBtn').removeClass('disabled');
      $('#opRunning').hide();
      $('#opResult').hide();
      optimizationRunning = false;
      return;
    }

    useTrailingStop = strategy.trailingSl !== null && !isNaN(strategy.trailingSl);
    useTrailingTarget = strategy.ttarget !== null && !isNaN(strategy.ttarget);
    if (strategy.ttarget != null && strategy.ttarget != undefined)

      ticks = {};
    for (let tf of timeframes) {
      let tfTicks = await getBinanceTicks(instrument, getShortTimeframe(tf), getStartDate(tf, startDate), endDate, false);
      if (tfTicks === null) {
        $('#runOptBtn').removeClass('disabled');
        $('#opRunning').hide();
        $('#opResult').hide();
        if (!opExecutionCanceled) {
          openModalInfo('Could not optain data from ' + exchange + ' for the given period. The period may be too long. Please try with smaller period or try again later!');
        }
        optimizationRunning = false;
        return;
      }
      ticks[tf] = tfTicks;

      if (opExecutionCanceled) {
        return;
      }
    }

    marketReturn = 0;
    let ticksTmp = ticks[timeframes[0]];
    for (let tick of ticksTmp) {
      if (tick.d >= startDate) {
        marketReturn = ((ticksTmp[ticksTmp.length - 1].c - tick.o) / tick.o) * 100;
        break;
      }
    }

    $('#opRunPercent2').hide();
    $('#opRunPercent').html('Optimization Execution: 0%');
    $('#opRunRemaining').html('&nbsp;');
    $('#opRunRocket').show();
    strategyVariations = [];
    fineTune = 0;
    strategyVariationsTested = 0;
    setRulesVariationsPatterns(strategy);

    strategyVariations = await getStrategyVariations(strategy, fineTune);
    strategyVariations.push(strategy);
    strategyVariationsTested = strategyVariations.length;

    strategyVariationsResults = [];
    strategyVariationsIntermitBestResults = [];
    opExecutedIndex = 0;
    opExecutionCanceled = false;
    opCompleted = 0;
    etaLastDate = null;
    etaStr = '';
    etaLastNum = null;
    //Initialize webworkers
    let cpus = os.cpus().length;

    let maxCPUs = cpus > 1
      ? cpus - 1
      : 1;
    if ($('#opOneCore').is(':checked')) {
      maxOpWorkers = 1;
    } else if ($('#opHalfCores').is(':checked')) {
      maxOpWorkers = cpus > 1
        ? cpus / 2
        : 1;
    } else {
      maxOpWorkers = maxCPUs;
    }

    if (!webWorkersInitialized) {
      for (let i = 0; i < maxCPUs; i++) {
        opExecutionWorkers[i] = new Worker("./assets/js/optimize-execution.js");
        opExecutionWorkers[i].addEventListener('error', async function(e) {
          log('error', 'opExecutionWorkers.EventListener error', e.message + '<br>' + e.filename + ' ' + e.lineno);
          openModalInfo('Internal Error Occurred!<br>' + e.message + '<br>' + e.filename + ' ' + e.lineno);
        }, false);
        opExecutionWorkers[i].addEventListener("message", async function(e) {
          try {
            if (typeof e.data === 'string' && e.data.startsWith('ERR')) {
              log('error', 'opExecutionWorkers.EventListener error', e.data);
              openModalInfo('Internal Error Occurred!<br>' + e.data);
              return;
            } else if (e.data instanceof Array && e.data[0] === 'STARTED') {

              let nextStrategy = await getNextOpStrategy();
              if (nextStrategy !== null) {
                try {
                  await opWorkerTerminateMutex.lock();
                  if (opExecutionCanceled) {
                    return;
                  }
                  if (opExecutionWorkers[e.data[1]] !== undefined) {
                    opExecutionWorkers[e.data[1]].postMessage(['STRATEGY', nextStrategy]);
                  }
                } finally {
                  opWorkerTerminateMutex.release();
                }
              }
            } else if (e.data instanceof Array && e.data[0] === 'STOPPED') {
              try {
                await runningWorkersMutex.lock();
                runningWorkiers--;
              } finally {
                runningWorkersMutex.release();
              }
            } else if (e.data instanceof Array && e.data[0] === 'RESULT') {

              let nextStrategy = await getNextOpStrategy();
              if (nextStrategy !== null) {
                try {
                  await opWorkerTerminateMutex.lock();
                  if (opExecutionCanceled) {
                    return;
                  }
                  if (opExecutionWorkers[e.data[1]] !== undefined) {
                    opExecutionWorkers[e.data[1]].postMessage(['STRATEGY', nextStrategy]);
                  }
                } finally {
                  opWorkerTerminateMutex.release();
                }
              }
              let completed = await addOpResult(e.data[2]);

              let percentCompleted = (100 / (fineTuneMaxCycles + 1) * fineTune) + (completed / strategyVariations.length) * (100 / (fineTuneMaxCycles + 1));
              if (percentCompleted > 100) {
                percentCompleted = 100;
              }

              let lap = 2;
              //if (percentCompleted > (100 / (fineTuneMaxCycles + 1))) {
              if (etaLastDate == null) {
                etaLastDate = new Date();
                etaLastNum = percentCompleted;
              } else if (etaLastNum + lap <= percentCompleted) {
                let dateNow = new Date();
                let dateDiff = (Math.abs((dateNow.getTime() - etaLastDate.getTime()) / 1000)) * (100 - percentCompleted) / lap;

                let minutes = Math.floor(dateDiff / 60);
                let seconds = dateDiff % 60;
                if (minutes > 0) {
                  if (seconds > 30) {
                    minutes++;
                  }
                  if (minutes === 1) {
                    etaStr = '~ ' + minutes.toFixed(0) + ' min';
                  } else {
                    etaStr = '~ ' + minutes.toFixed(0) + ' mins';
                  }
                } else {
                  etaStr = '< 1 min';
                }

                etaLastDate = new Date();
                etaLastNum = percentCompleted;
                $('#opRunRemaining').html('time left ' + etaStr);
              }
              //}
              $('#opRunPercent').html('Optimization Execution: ' + percentCompleted.toFixed(0) + '%');

              if (completed === strategyVariations.length) {
                if (opExecutionCanceled) {
                  return;
                }
                if (fineTune < fineTuneMaxCycles) {
                  doFineTuneOfResult();
                } else {
                  fillOptimizationResult(marketReturn);
                }
              }

            } else {
              log('error', 'opExecutionWorkers.EventListener error', e.data);
              openModalInfo('Unexpected Internal Error Occurred!<br>' + e.data);
            }
          } catch (err) {
            log('error', 'runOptimize', err.stack);
            openModalInfo('Internal Error Occurred!<br>' + err.stack);
          } finally {
            executionOpMutex.release();
          }
        }, false);
      }
      webWorkersInitialized = true;
    }

    for (let i = 0; i < maxOpWorkers; i++) {
      try {
        await opWorkerTerminateMutex.lock();
        if (opExecutionCanceled) {
          optimizationRunning = false;
          return;
        }
        opExecutionWorkers[i].postMessage([
          'INITIALIZE',
          i,
          timeframes,
          startDate,
          ticks,
          feeRate
        ]);
        runningWorkiers++;
      } finally {
        opWorkerTerminateMutex.release();
      }
    }

  } catch (err) {
    log('error', 'runOptimize', err.stack);
    $('#opRunning').hide();
    optimizationRunning = false;
    await terminateOpWorkers();
    openModalInfo('Internal Error Occurred!<br>' + err.stack);
  }
}

function countRuleFields(rule) {
  let fieldsToChange = 0;
  switch (rule.indicator) {
    case 'sma':
    case 'ema':
      if (rule.direction === 'crossing') {
        fieldsToChange++;
      } else {
        fieldsToChange += 2;
      }
      break;
    case "cma":
      fieldsToChange += 2;
      break;
    case 'rsi':
      fieldsToChange += 2;
      break;
    case 'macd':
      if (rule.type === 'signal line') {
        if (rule.direction === 'crossing') {
          fieldsToChange += 3;
        } else {
          fieldsToChange += 4;
        }
      } else {
        fieldsToChange += 2;
      }
      break;
    case 'bb':
      if (rule.direction === 'crossing') {
        fieldsToChange += 2;
      } else {
        fieldsToChange += 3;
      }
      break;
    case 'sto':
      fieldsToChange += 4;
      break;
    case 'stoRsi':
      fieldsToChange += 5;
      break;
  }

  return fieldsToChange;
}

function calculateFieldsToChange(strategy) {
  let fieldsToChange = changeStoploss
    ? 1
    : 0;
  if (changeTarget) {
    fieldsToChange++;
    if (useTrailingTarget) {
      fieldsToChange++;
    }
  }

  for (let rule of strategy.buyRules) {
    fieldsToChange += countRuleFields(rule);
  }
  for (let rule of strategy.sellRules) {
    fieldsToChange += countRuleFields(rule);
  }
  return fieldsToChange;
}

function setRulesVariationsPatterns(strategy) {

  fineTuneMaxCycles = 6;

  //MA
  maPeriods = [10, 29, 48];
  maPeriodsFineTune1 = [-5, 5];
  maPeriodsFineTune2 = [-3, 3];
  maPeriodsFineTune3 = [-2, 2];
  maPeriodsFineTune4 = [-2, 2];
  maPeriodsFineTune5 = [-1, 1];
  maPeriodsFineTune6 = [-1, 1];
  maValues = [1, 3];
  maValuesFineTune1 = [-0.5, 0.5];
  maValuesFineTune2 = [-0.5, 0.5];
  maValuesFineTune3 = [-0.5, 0.5];
  maValuesFineTune4 = [-0.25, 0.25];
  maValuesFineTune5 = [-0.25, 0.25];
  maValuesFineTune6 = [-0.25, 0.25];

  //RSI
  rsiPeriods = [7, 14];
  rsiPeriodsFineTune1 = [-4, 4];
  rsiPeriodsFineTune2 = [-3, 3];
  rsiPeriodsFineTune3 = [-3, 3];
  rsiPeriodsFineTune4 = [-3, 3];
  rsiPeriodsFineTune5 = [-2, 2];
  rsiPeriodsFineTune6 = [-1, 1];
  rsiValues = [40, 60];
  rsiValuesFineTune1 = [-10, 10];
  rsiValuesFineTune2 = [-5, 5];
  rsiValuesFineTune3 = [-4, 4];
  rsiValuesFineTune4 = [-3, 3];
  rsiValuesFineTune5 = [-2, 2];
  rsiValuesFineTune6 = [-1, 1];

  //MACD
  macdPeriods = [6, 15, 24];
  macdPeriodsFineTune1 = [-3, 3];
  macdPeriodsFineTune2 = [-2, 2];
  macdPeriodsFineTune3 = [-2, 2];
  macdPeriodsFineTune4 = [-2, 2];
  macdPeriodsFineTune5 = [-1, 1];
  macdPeriodsFineTune6 = [-1, 1];
  macdPeriods2 = [10, 19, 28];
  macdPeriods2FineTune1 = [-3, 3];
  macdPeriods2FineTune2 = [-2, 2];
  macdPeriods2FineTune3 = [-2, 2];
  macdPeriods2FineTune4 = [-2, 2];
  macdPeriods2FineTune5 = [-1, 1];
  macdPeriods2FineTune6 = [-1, 1];
  macdPeriods3 = [6, 14];
  macdPeriods3FineTune1 = [-2, 2];
  macdPeriods3FineTune2 = [-1, 1];
  macdPeriods3FineTune3 = [-1, 1];
  macdPeriods3FineTune4 = [-1, 1];
  macdPeriods3FineTune5 = [-1, 1];
  macdPeriods3FineTune6 = [-1, 1];
  macdValues = [1, 3];
  macdValuesFineTune1 = [-0.5, 0.5];
  macdValuesFineTune2 = [-0.5, 0.5];
  macdValuesFineTune3 = [-0.5, 0.5];
  macdValuesFineTune4 = [-0.25, 0.25];
  macdValuesFineTune5 = [0];
  macdValuesFineTune6 = [0];

  //BB
  bbPeriods = [10, 29, 48];
  bbPeriodsFineTune1 = [-4, 4];
  bbPeriodsFineTune2 = [-3, 3];
  bbPeriodsFineTune3 = [-2, 2];
  bbPeriodsFineTune4 = [-1, 1];
  bbPeriodsFineTune5 = [-2, 2];
  bbPeriodsFineTune6 = [-1, 1];
  bbPeriods2 = [1, 3];
  bbPeriods2FineTune1 = [-0.5, 0.5];
  bbPeriods2FineTune2 = [-0.25, 0.25];
  bbPeriods2FineTune3 = [-0.25, 0.25];
  bbPeriods2FineTune4 = [-0.25, 0.25];
  bbPeriods2FineTune5 = [-0.25, 0.25];
  bbPeriods2FineTune6 = [-0.25, 0.25];
  bbValues = [1, 3];
  bbValuesFineTune1 = [-0.5, 0.5];
  bbValuesFineTune2 = [-0.5, 0.5];
  bbValuesFineTune3 = [-0.25, 0.25];
  bbValuesFineTune4 = [-0.25, 0.25];
  bbValuesFineTune5 = [-0.25, 0.25];
  bbValuesFineTune6 = [-0.25, 0.25];

  //STOCHASTIC
  stoPeriods = [7, 14];
  stoPeriodsFineTune1 = [-4, 4];
  stoPeriodsFineTune2 = [-3, 3];
  stoPeriodsFineTune3 = [-3, 3];
  stoPeriodsFineTune4 = [-3, 3];
  stoPeriodsFineTune5 = [-2, 2];
  stoPeriodsFineTune6 = [-1, 1];
  stoPeriods2 = [3, 8];
  stoPeriods2FineTune1 = [-1, 1];
  stoPeriods2FineTune2 = [-1, 1];
  stoPeriods2FineTune3 = [-1, 1];
  stoPeriods2FineTune4 = [-1, 1];
  stoPeriods2FineTune5 = [-1, 1];
  stoPeriods2FineTune6 = [-1, 1];
  stoPeriods3 = [3, 8];
  stoPeriods3FineTune1 = [-1, 1];
  stoPeriods3FineTune2 = [-1, 1];
  stoPeriods3FineTune3 = [-1, 1];
  stoPeriods3FineTune4 = [-1, 1];
  stoPeriods3FineTune5 = [-1, 1];
  stoPeriods3FineTune6 = [-1, 1];
  stoPeriods4 = [7, 14];
  stoPeriods4FineTune1 = [-4, 4];
  stoPeriods4FineTune2 = [-3, 3];
  stoPeriods4FineTune3 = [-3, 3];
  stoPeriods4FineTune4 = [-3, 3];
  stoPeriods4FineTune5 = [-2, 2];
  stoPeriods4FineTune6 = [-1, 1];
  stoValues = [30, 70];
  stoValuesFineTune1 = [-10, 10];
  stoValuesFineTune2 = [-5, 5];
  stoValuesFineTune3 = [-4, 4];
  stoValuesFineTune4 = [-3, 3];
  stoValuesFineTune5 = [-2, 2];
  stoValuesFineTune6 = [-1, 1];
}

function rulesAreSame(rule1, rule2) {
  return rule1.period == rule2.period && rule1.period2 == rule2.period2 && rule1.period3 == rule2.period3 && rule1.value == rule2.value && rule1.period4 == rule2.period4;
}

function pushNewStrategyVariation(variations, strategy) {
  for (let strategyTmp of variations) {
    let allBuyRulesAreSame = true;
    for (let i = 0; i < strategyTmp.buyRules.length; i++) {
      if (!rulesAreSame(strategyTmp.buyRules[i], strategy.buyRules[i])) {
        allBuyRulesAreSame = false;
        break;
      }
    }
    if (allBuyRulesAreSame) {
      let allSellRulesAreSame = true;
      for (let i = 0; i < strategyTmp.sellRules.length; i++) {
        if (!rulesAreSame(strategyTmp.sellRules[i], strategy.sellRules[i])) {
          allSellRulesAreSame = false;
          break;
        }
      }
      if (allSellRulesAreSame) {
        if (strategyTmp.stoploss == strategy.stoploss && strategyTmp.trailingSl == strategy.trailingSl && strategyTmp.target == strategy.target && strategyTmp.ttarget == strategy.ttarget) {
          return false;
        }
      }
    }
  }
  variations.push(strategy);
  return true;
}

async function getStrategyVariationsFromResult(strategiesToAdd) {
  let addedStrategies = 0;
  let result = [];
  let usedStrategies = [];
  let counter = 0;
  for (let strategyRes of strategyVariationsResults) {
    let pushedRes = pushNewStrategyVariation(usedStrategies, strategyRes.strategy);
    if (!pushedRes) {
      continue;
    }

    strategyVariationsIntermitBestResults.push(strategyRes);
    let strategyVariationsTmp = await getStrategyVariations(strategyRes.strategy, fineTune);

    for (let strategyTmp of strategyVariationsTmp) {
      result.push(strategyTmp);
      counter = await incrementCounterWithSleep(counter);
    }
    addedStrategies++;
    if (addedStrategies >= strategiesToAdd) {
      break;
    }
  }
  return result;
}

function compareStrategyResults(a, b) {
  let ratioA = null;
  let ratioB = null;
  //Max return for lowest risk
  if (optType === 'riskReward') {
    ratioA = (a.maxDrawdown != 0)
      ? a.totalReturn / Math.abs(a.maxDrawdown)
      : a.totalReturn;
    ratioB = (b.maxDrawdown != 0)
      ? b.totalReturn / Math.abs(b.maxDrawdown)
      : b.totalReturn;
  } else if (optType === 'return') {
    ratioA = a.totalReturn;
    ratioB = b.totalReturn;
  } else if (optType === 'smooth') {
    //ratioA = a.totalReturn - (a.biggestGain-Math.abs(a.avgGainLossPerTrade));
    //ratioB = b.totalReturn - (b.biggestGain-Math.abs(b.avgGainLossPerTrade));
    let returnWithoutBestTradeA = a.totalReturn - (a.biggestGain - Math.abs(a.avgGainLossPerTrade));
    let returnWithoutBestTradeB = b.totalReturn - (b.biggestGain - Math.abs(b.avgGainLossPerTrade));

    let avgTradesCountA = a.executedTrades - 1;
    let avgTradesCountB = b.executedTrades - 1;

    let avgTradeWithoutBestTradeA = (avgTradesCountA > 0)
      ? returnWithoutBestTradeA / avgTradesCountA
      : 0;
    let avgTradeWithoutBestTradeB = (avgTradesCountB > 0)
      ? returnWithoutBestTradeB / avgTradesCountB
      : 0;

    let totalReturnToMaxDrawdownA = (a.maxDrawdown != 0)
      ? returnWithoutBestTradeA / Math.abs(a.maxDrawdown)
      : returnWithoutBestTradeA;
    let totalReturnToMaxDrawdownB = (b.maxDrawdown != 0)
      ? returnWithoutBestTradeB / Math.abs(b.maxDrawdown)
      : returnWithoutBestTradeB;

    ratioA = (totalReturnToMaxDrawdownA < 0 && avgTradeWithoutBestTradeA < 0)
      ? (-1) * totalReturnToMaxDrawdownA * avgTradeWithoutBestTradeA
      : totalReturnToMaxDrawdownA * avgTradeWithoutBestTradeA;

    ratioB = (totalReturnToMaxDrawdownB < 0 && avgTradeWithoutBestTradeB < 0)
      ? (-1) * totalReturnToMaxDrawdownB * avgTradeWithoutBestTradeB
      : totalReturnToMaxDrawdownB * avgTradeWithoutBestTradeB;
  }

  return (ratioA < ratioB)
    ? 1
    : (
      (ratioB < ratioA)
      ? -1
      : 0);
}

async function doFineTuneOfResult() {
  try {
    if (strategyVariationsResults.length == 0) {
      fineTune = fineTuneMaxCycles;
      fillOptimizationResult(marketReturn);
      return;
    }
    await terminateOpWorkers();
    strategyVariationsResults.sort(function(a, b) {
      return compareStrategyResults(a, b)
    });
    fineTune++;
    strategyVariations = [];
    opExecutedIndex = 0;
    opExecutionCanceled = false;
    opCompleted = 0;

    let strategiesToAdd = 10;
    strategyVariations = await getStrategyVariationsFromResult(strategiesToAdd);
    strategyVariationsTested += strategyVariations.length;

    if (strategyVariations.length == 0) {
      fineTune = fineTuneMaxCycles;
      fillOptimizationResult(marketReturn);
      return;
    }
    strategyVariationsResults = [];
    for (let i = 0; i < maxOpWorkers; i++) {
      try {
        await opWorkerTerminateMutex.lock();
        if (opExecutionCanceled) {
          optimizationRunning = false;
          return;
        }
        opExecutionWorkers[i].postMessage([
          'INITIALIZE',
          i,
          timeframes,
          startDate,
          ticks,
          feeRate
        ]);
        runningWorkiers++;
      } finally {
        opWorkerTerminateMutex.release();
      }
    }

  } catch (err) {
    optimizationRunning = false;
    $('#runOptBtn').removeClass('disabled');
    $('#opCancelBtn').removeClass('disabled');
    log('error', 'doFineTuneOfResult', err.stack);
  }
}

function createRuleVariation(rule, period, value, crossDirection, type2, period2, period3, period4) {
  let newRule = {};
  newRule.indicator = rule.indicator;
  newRule.timeframe = rule.timeframe;
  newRule.direction = rule.direction;
  newRule.type = rule.type;
  newRule.crossDirection = rule.crossDirection;
  newRule.period = period;
  if (value != undefined && value != null) {
    newRule.value = value;
  }
  if (crossDirection != undefined && crossDirection != null) {
    newRule.crossDirection = crossDirection;
  }
  if (type2 != undefined && type2 != null) {
    newRule.type2 = type2;
  }
  if (period2 != undefined && period2 != null) {
    newRule.period2 = period2;
  }
  if (period3 != undefined && period3 != null) {
    newRule.period3 = period3;
  }
  if (period4 != undefined && period4 != null) {
    newRule.period4 = period4;
  }

  return newRule;
}

function getRuleVariations(rule) {
  let ruleVariations = [];
  if (rule.indicator === 'sma' || rule.indicator === 'ema') {
    if (rule.direction !== 'crossing') {
      for (let period of maPeriods) {
        for (let value of maValues) {
          ruleVariations.push(createRuleVariation(rule, period, value));
        }
      }
    } else {
      for (let period of maPeriods) {
        ruleVariations.push(createRuleVariation(rule, period, null));
      }
    }
  } else if (rule.indicator === 'cma') {
    for (let period of maPeriods) {
      for (let period2 of maPeriods) {
        if (period >= period2) {
          continue;
        }
        ruleVariations.push(createRuleVariation(rule, period, null, rule.crossDirection, rule.type2, period2));
      }
    }
  } else if (rule.indicator === 'rsi') {
    for (let period of rsiPeriods) {
      for (let value of rsiValues) {
        ruleVariations.push(createRuleVariation(rule, period, value));
      }
    }
  } else if (rule.indicator === 'macd') {
    if (rule.type === 'signal line') {
      if (rule.direction !== 'crossing') {
        for (let period of macdPeriods) {
          for (let period2 of macdPeriods2) {
            if (period >= period2) {
              continue;
            }
            for (let period3 of macdPeriods3) {
              for (let value of macdValues) {
                ruleVariations.push(createRuleVariation(rule, period, value, null, null, period2, period3));
              }
            }
          }
        }
      } else {
        for (let period of macdPeriods) {
          for (let period2 of macdPeriods2) {
            if (period >= period2) {
              continue;
            }
            for (let period3 of macdPeriods3) {
              ruleVariations.push(createRuleVariation(rule, period, null, rule.crossDirection, null, period2, period3));
            }
          }
        }
      }
    } else {
      for (let period of macdPeriods) {
        for (let period2 of macdPeriods2) {
          if (period >= period2) {
            continue;
          }
          ruleVariations.push(createRuleVariation(rule, period, null, rule.crossDirection, null, period2, null));
        }
      }
    }
  } else if (rule.indicator === 'bb') {
    if (rule.direction !== 'crossing') {
      for (let period of bbPeriods) {
        for (let period2 of bbPeriods2) {
          for (let value of bbValues) {
            ruleVariations.push(createRuleVariation(rule, period, value, null, null, period2, null));
          }
        }
      }
    } else {
      for (let period of bbPeriods) {
        for (let period2 of bbPeriods2) {
          ruleVariations.push(createRuleVariation(rule, period, null, rule.crossDirection, null, period2, null));
        }
      }
    }
  } else if (rule.indicator === 'sto') {
    for (let period of stoPeriods) {
      for (let period2 of stoPeriods2) {
        for (let period3 of stoPeriods3) {
          for (let value of stoValues) {
            ruleVariations.push(createRuleVariation(rule, period, value, rule.crossDirection, null, period2, period3));
          }
        }
      }
    }
  } else if (rule.indicator === 'stoRsi') {
    for (let period of stoPeriods) {
      for (let period2 of stoPeriods2) {
        for (let period3 of stoPeriods3) {
          for (let period4 of stoPeriods4) {
            for (let value of stoValues) {
              ruleVariations.push(createRuleVariation(rule, period, value, rule.crossDirection, null, period2, period3, period4));
            }
          }
        }
      }
    }
  }

  return ruleVariations;
}

let fineTuneMaxCycles = 3;

let maPeriods = [];
let maValues = [];

let rsiPeriods = [];
let rsiValues = [];

let macdPeriods = [];
let macdPeriods2 = [];
let macdPeriods3 = [];
let macdValues = [];

let bbPeriods = [];
let bbPeriods2 = [];
let bbValues = [];

let stoPeriods = [];
let stoPeriods2 = [];
let stoPeriods3 = [];
let stoPeriods4 = [];
let stoValues = [];

//Fina tune values

let maPeriodsFineTune = [];
let maValuesFineTune = [];
let maPeriodsFineTune1 = [];
let maValuesFineTune1 = [];
let maPeriodsFineTune2 = [];
let maValuesFineTune2 = [];
let maPeriodsFineTune3 = [];
let maValuesFineTune3 = [];
let maPeriodsFineTune4 = [];
let maValuesFineTune4 = [];
let maPeriodsFineTune5 = [];
let maValuesFineTune5 = [];
let maPeriodsFineTune6 = [];
let maValuesFineTune6 = [];

let rsiPeriodsFineTune = [];
let rsiValuesFineTune = [];
let rsiPeriodsFineTune1 = [];
let rsiValuesFineTune1 = [];
let rsiPeriodsFineTune2 = [];
let rsiValuesFineTune2 = [];
let rsiPeriodsFineTune3 = [];
let rsiValuesFineTune3 = [];
let rsiPeriodsFineTune4 = [];
let rsiValuesFineTune4 = [];
let rsiPeriodsFineTune5 = [];
let rsiValuesFineTune5 = [];
let rsiPeriodsFineTune6 = [];
let rsiValuesFineTune6 = [];

let macdPeriodsFineTune = [];
let macdPeriods2FineTune = [];
let macdPeriods3FineTune = [];
let macdValuesFineTune = [];
let macdPeriodsFineTune1 = [];
let macdPeriods2FineTune1 = [];
let macdPeriods3FineTune1 = [];
let macdValuesFineTune1 = [];
let macdPeriodsFineTune2 = [];
let macdPeriods2FineTune2 = [];
let macdPeriods3FineTune2 = [];
let macdValuesFineTune2 = [];
let macdPeriodsFineTune3 = [];
let macdPeriods2FineTune3 = [];
let macdPeriods3FineTune3 = [];
let macdValuesFineTune3 = [];
let macdPeriodsFineTune4 = [];
let macdPeriods2FineTune4 = [];
let macdPeriods3FineTune4 = [];
let macdValuesFineTune4 = [];
let macdPeriodsFineTune5 = [];
let macdPeriods2FineTune5 = [];
let macdPeriods3FineTune5 = [];
let macdValuesFineTune5 = [];
let macdPeriodsFineTune6 = [];
let macdPeriods2FineTune6 = [];
let macdPeriods3FineTune6 = [];
let macdValuesFineTune6 = [];

let bbPeriodsFineTune = [];
let bbPeriods2FineTune = [];
let bbValuesFineTune = [];
let bbPeriodsFineTune1 = [];
let bbPeriods2FineTune1 = [];
let bbValuesFineTune1 = [];
let bbPeriodsFineTune2 = [];
let bbPeriods2FineTune2 = [];
let bbValuesFineTune2 = [];
let bbPeriodsFineTune3 = [];
let bbPeriods2FineTune3 = [];
let bbValuesFineTune3 = [];
let bbPeriodsFineTune4 = [];
let bbPeriods2FineTune4 = [];
let bbValuesFineTune4 = [];
let bbPeriodsFineTune5 = [];
let bbPeriods2FineTune5 = [];
let bbValuesFineTune5 = [];
let bbPeriodsFineTune6 = [];
let bbPeriods2FineTune6 = [];
let bbValuesFineTune6 = [];

let stoPeriodsFineTune = [];
let stoPeriods2FineTune = [];
let stoPeriods3FineTune = [];
let stoPeriods4FineTune = [];
let stoValuesFineTune = [];
let stoPeriodsFineTune1 = [];
let stoPeriodsFineTune2 = [];
let stoPeriodsFineTune3 = [];
let stoPeriodsFineTune4 = [];
let stoPeriodsFineTune5 = [];
let stoPeriodsFineTune6 = [];
let stoPeriods2FineTune1 = [];
let stoPeriods2FineTune2 = [];
let stoPeriods2FineTune3 = [];;
let stoPeriods2FineTune4 = [];
let stoPeriods2FineTune5 = [];
let stoPeriods2FineTune6 = [];
let stoPeriods3FineTune1 = [];
let stoPeriods3FineTune2 = [];
let stoPeriods3FineTune3 = [];
let stoPeriods3FineTune4 = [];
let stoPeriods3FineTune5 = [];
let stoPeriods3FineTune6 = [];
let stoPeriods4FineTune1 = [];
let stoPeriods4FineTune2 = [];
let stoPeriods4FineTune3 = [];
let stoPeriods4FineTune4 = [];
let stoPeriods4FineTune5 = [];
let stoPeriods4FineTune6 = [];
let stoValuesFineTune1 = [];
let stoValuesFineTune2 = [];
let stoValuesFineTune3 = [];
let stoValuesFineTune4 = [];
let stoValuesFineTune5 = [];
let stoValuesFineTune6 = [];

let stoplossesFineTune0 = [2, 4.5, 7];
let stoplossesFineTune1 = [-0.5, 0.5];
let stoplossesFineTune2 = [-0.25, 0.25];
let stoplossesFineTune3 = [-0.25, 0.25];
let stoplossesFineTune4 = [-0.25, 0.25];
let stoplossesFineTune5 = [-0.15, 0.15];
let stoplossesFineTune6 = [-0.1, 0.1];

let targetsFineTune0 = [2, 4.5, 7];
let targetsFineTune1 = [-0.5, 0.5];
let targetsFineTune2 = [-0.25, 0.25];
let targetsFineTune3 = [-0.25, 0.25];
let targetsFineTune4 = [-0.25, 0.25];
let targetsFineTune5 = [-0.15, 0.15];
let targetsFineTune6 = [-0.1, 0.1];

let ttargetsFineTune0 = [2, 4.5, 7];
let ttargetsFineTune1 = [-0.5, 0.5];
let ttargetsFineTune2 = [-0.25, 0.25];
let ttargetsFineTune3 = [-0.25, 0.25];
let ttargetsFineTune4 = [-0.25, 0.25];
let ttargetsFineTune5 = [-0.15, 0.15];
let ttargetsFineTune6 = [-0.1, 0.1];

function getRuleVariationsFineTune(rule) {
  let ruleVariations = [];

  if (rule.indicator === 'sma' || rule.indicator === 'ema') {
    if (rule.direction !== 'crossing') {
      for (let period of maPeriodsFineTune) {
        let periodToUse = rule.period + period;
        if (periodToUse < 2) {
          continue;
        }
        for (let value of maValuesFineTune) {
          let valueToUse = rule.value + value;
          if (valueToUse <= 0) {
            valueToUse = 0.1
          }
          ruleVariations.push(createRuleVariation(rule, periodToUse, fixNumber(valueToUse, 2)));
        }
      }
    } else {
      for (let period of maPeriodsFineTune) {
        let periodToUse = rule.period + period;
        if (periodToUse < 2) {
          continue;
        }
        ruleVariations.push(createRuleVariation(rule, periodToUse, null));
      }
    }
  } else if (rule.indicator === 'cma') {
    for (let period of maPeriodsFineTune) {
      let periodToUse = rule.period + period;
      if (periodToUse < 2) {
        continue;
      }
      for (let period2 of maPeriodsFineTune) {
        let periodToUse2 = rule.period2 + period2;
        if (periodToUse >= periodToUse2) {
          continue;
        }
        ruleVariations.push(createRuleVariation(rule, periodToUse, null, rule.crossDirection, rule.type2, periodToUse2));
      }
    }
  } else if (rule.indicator === 'rsi') {
    for (let period of rsiPeriodsFineTune) {
      let periodToUse = rule.period + period;
      if (periodToUse < 2) {
        continue;
      }
      for (let value of rsiValuesFineTune) {
        let valueToUse = rule.value + value;
        if (valueToUse <= 0) {
          valueToUse = 1;
        } else if (valueToUse >= 100) {
          valueToUse = 99;
        }
        ruleVariations.push(createRuleVariation(rule, periodToUse, fixNumber(valueToUse, 2)));
      }
    }
  } else if (rule.indicator === 'macd') {
    if (rule.type === 'signal line') {
      if (rule.direction !== 'crossing') {
        for (let period of macdPeriodsFineTune) {
          for (let period2 of macdPeriods2FineTune) {
            let periodToUse = rule.period + period;
            let periodToUse2 = rule.period2 + period2;
            if (periodToUse >= periodToUse2 || periodToUse < 2) {
              continue;
            }
            for (let period3 of macdPeriods3FineTune) {
              let periodToUse3 = rule.period3 + period3;
              if (periodToUse3 < 2) {
                continue;
              }
              for (let value of macdValuesFineTune) {
                let valueToUse = rule.value + value;
                if (valueToUse <= 0) {
                  valueToUse = 0.1
                }
                ruleVariations.push(createRuleVariation(rule, periodToUse, fixNumber(valueToUse, 2), null, null, periodToUse2, periodToUse3));
              }
            }
          }
        }
      } else {
        for (let period of macdPeriodsFineTune) {
          for (let period2 of macdPeriods2FineTune) {
            let periodToUse = rule.period + period;
            let periodToUse2 = rule.period2 + period2;
            if (periodToUse >= periodToUse2 || periodToUse < 2) {
              continue;
            }
            for (let period3 of macdPeriods3FineTune) {
              let periodToUse3 = rule.period3 + period3;
              if (periodToUse3 < 2) {
                continue;
              }
              ruleVariations.push(createRuleVariation(rule, periodToUse, null, rule.crossDirection, null, periodToUse2, periodToUse3));
            }
          }
        }
      }
    } else {
      for (let period of macdPeriodsFineTune) {
        for (let period2 of macdPeriods2FineTune) {
          let periodToUse = rule.period + period;
          let periodToUse2 = rule.period2 + period2;
          if (periodToUse >= periodToUse2 || periodToUse < 2) {
            continue;
          }
          ruleVariations.push(createRuleVariation(rule, periodToUse, null, rule.crossDirection, null, periodToUse2, null));
        }
      }
    }

  } else if (rule.indicator === 'bb') {
    if (rule.direction !== 'crossing') {
      for (let period of bbPeriodsFineTune) {
        let periodToUse = rule.period + period;
        if (periodToUse < 2) {
          continue;
        }
        for (let period2 of bbPeriods2FineTune) {
          let periodToUse2 = rule.period2 + period2;
          if (periodToUse2 <= 0) {
            continue;
          }
          for (let value of bbValuesFineTune) {
            let valueToUse = rule.value + value;
            if (valueToUse <= 0) {
              valueToUse = 0.1
            }
            ruleVariations.push(createRuleVariation(rule, periodToUse, fixNumber(valueToUse, 2), null, null, periodToUse2, null));
          }
        }
      }
    } else {
      for (let period of bbPeriodsFineTune) {
        let periodToUse = rule.period + period;
        if (periodToUse < 2) {
          continue;
        }
        for (let period2 of bbPeriods2FineTune) {
          let periodToUse2 = rule.period2 + period2;
          if (periodToUse2 <= 0) {
            continue;
          }
          ruleVariations.push(createRuleVariation(rule, periodToUse, null, rule.crossDirection, null, periodToUse2, null));
        }
      }
    }
  } else if (rule.indicator === 'sto') {
    for (let period of stoPeriodsFineTune) {
      let periodToUse = rule.period + period;
      if (periodToUse < 2) {
        continue;
      }
      for (let period2 of stoPeriods2FineTune) {
        let periodToUse2 = rule.period2 + period2;
        if (periodToUse2 <= 0) {
          continue;
        }
        for (let period3 of stoPeriods3FineTune) {
          let periodToUse3 = rule.period3 + period3;
          if (periodToUse3 <= 0) {
            continue;
          }
          for (let value of stoValuesFineTune) {
            let valueToUse = rule.value + value;
            if (valueToUse <= 0) {
              valueToUse = 1;
            } else if (valueToUse >= 100) {
              valueToUse = 99;
            }
            ruleVariations.push(createRuleVariation(rule, periodToUse, fixNumber(valueToUse, 2), rule.crossDirection, null, periodToUse2, periodToUse3));
          }
        }
      }
    }
  } else if (rule.indicator === 'stoRsi') {
    for (let period of stoPeriodsFineTune) {
      let periodToUse = rule.period + period;
      if (periodToUse < 2) {
        continue;
      }
      for (let period2 of stoPeriods2FineTune) {
        let periodToUse2 = rule.period2 + period2;
        if (periodToUse2 <= 0) {
          continue;
        }
        for (let period3 of stoPeriods3FineTune) {
          let periodToUse3 = rule.period3 + period3;
          if (periodToUse3 <= 0) {
            continue;
          }
          for (let period4 of stoPeriods4FineTune) {
            let periodToUse4 = rule.period4 + period4;
            if (periodToUse4 < 2) {
              continue;
            }
            for (let value of stoValuesFineTune) {
              let valueToUse = rule.value + value;
              if (valueToUse <= 0) {
                valueToUse = 1;
              } else if (valueToUse >= 100) {
                valueToUse = 99;
              }
              ruleVariations.push(createRuleVariation(rule, periodToUse, fixNumber(valueToUse, 2), rule.crossDirection, null, periodToUse2, periodToUse3, periodToUse4));
            }
          }
        }
      }
    }
  }

  return ruleVariations;
}

function getRulesVariations(rules, fineTune) {
  if (rules == null || rules == undefined || rules.length === 0) {
    return [];
  }

  let rulesVariations = [];

  for (let rule of rules) {
    let ruleVariations = null;
    switch (fineTune) {
      case 0:
        ruleVariations = getRuleVariations(rule);
        break;
      case 1:
        maPeriodsFineTune = maPeriodsFineTune1;
        maValuesFineTune = maValuesFineTune1;
        rsiPeriodsFineTune = rsiPeriodsFineTune1;
        rsiValuesFineTune = rsiValuesFineTune1;
        macdPeriodsFineTune = macdPeriodsFineTune1;
        macdPeriods2FineTune = macdPeriods2FineTune1;
        macdPeriods3FineTune = macdPeriods3FineTune1;
        macdValuesFineTune = macdValuesFineTune1;
        bbPeriodsFineTune = bbPeriodsFineTune1;
        bbPeriods2FineTune = bbPeriods2FineTune1;
        bbValuesFineTune = bbValuesFineTune1;
        stoPeriodsFineTune = stoPeriodsFineTune1;
        stoPeriods2FineTune = stoPeriods2FineTune1;
        stoPeriods3FineTune = stoPeriods3FineTune1;
        stoPeriods4FineTune = stoPeriods4FineTune1;
        stoValuesFineTune = stoValuesFineTune1;
        ruleVariations = getRuleVariationsFineTune(rule);
        break;
      case 2:
        maPeriodsFineTune = maPeriodsFineTune2;
        maValuesFineTune = maValuesFineTune2;
        rsiPeriodsFineTune = rsiPeriodsFineTune2;
        rsiValuesFineTune = rsiValuesFineTune2;
        macdPeriodsFineTune = macdPeriodsFineTune2;
        macdPeriods2FineTune = macdPeriods2FineTune2;
        macdPeriods3FineTune = macdPeriods3FineTune2;
        macdValuesFineTune = macdValuesFineTune2;
        bbPeriodsFineTune = bbPeriodsFineTune2;
        bbPeriods2FineTune = bbPeriods2FineTune2;
        bbValuesFineTune = bbValuesFineTune2;
        stoPeriodsFineTune = stoPeriodsFineTune2;
        stoPeriods2FineTune = stoPeriods2FineTune2;
        stoPeriods3FineTune = stoPeriods3FineTune2;
        stoPeriods4FineTune = stoPeriods4FineTune2;
        stoValuesFineTune = stoValuesFineTune2;
        ruleVariations = getRuleVariationsFineTune(rule);
        break;
      case 3:
        maPeriodsFineTune = maPeriodsFineTune3;
        maValuesFineTune = maValuesFineTune3;
        rsiPeriodsFineTune = rsiPeriodsFineTune3;
        rsiValuesFineTune = rsiValuesFineTune3;
        macdPeriodsFineTune = macdPeriodsFineTune3;
        macdPeriods2FineTune = macdPeriods2FineTune3;
        macdPeriods3FineTune = macdPeriods3FineTune3;
        macdValuesFineTune = macdValuesFineTune3;
        bbPeriodsFineTune = bbPeriodsFineTune3;
        bbPeriods2FineTune = bbPeriods2FineTune3;
        bbValuesFineTune = bbValuesFineTune3;
        stoPeriodsFineTune = stoPeriodsFineTune3;
        stoPeriods2FineTune = stoPeriods2FineTune3;
        stoPeriods3FineTune = stoPeriods3FineTune3;
        stoPeriods4FineTune = stoPeriods4FineTune3;
        stoValuesFineTune = stoValuesFineTune3;
        ruleVariations = getRuleVariationsFineTune(rule);
        break;
      case 4:
        maPeriodsFineTune = maPeriodsFineTune4;
        maValuesFineTune = maValuesFineTune4;
        rsiPeriodsFineTune = rsiPeriodsFineTune4;
        rsiValuesFineTune = rsiValuesFineTune4;
        macdPeriodsFineTune = macdPeriodsFineTune4;
        macdPeriods2FineTune = macdPeriods2FineTune4;
        macdPeriods3FineTune = macdPeriods3FineTune4;
        macdValuesFineTune = macdValuesFineTune4;
        bbPeriodsFineTune = bbPeriodsFineTune4;
        bbPeriods2FineTune = bbPeriods2FineTune4;
        bbValuesFineTune = bbValuesFineTune4;
        stoPeriodsFineTune = stoPeriodsFineTune4;
        stoPeriods2FineTune = stoPeriods2FineTune4;
        stoPeriods3FineTune = stoPeriods3FineTune4;
        stoPeriods4FineTune = stoPeriods4FineTune4;
        stoValuesFineTune = stoValuesFineTune4;
        ruleVariations = getRuleVariationsFineTune(rule);
        break;
      case 5:
        maPeriodsFineTune = maPeriodsFineTune5;
        maValuesFineTune = maValuesFineTune5;
        rsiPeriodsFineTune = rsiPeriodsFineTune5;
        rsiValuesFineTune = rsiValuesFineTune5;
        macdPeriodsFineTune = macdPeriodsFineTune5;
        macdPeriods2FineTune = macdPeriods2FineTune5;
        macdPeriods3FineTune = macdPeriods3FineTune5;
        macdValuesFineTune = macdValuesFineTune5;
        bbPeriodsFineTune = bbPeriodsFineTune5;
        bbPeriods2FineTune = bbPeriods2FineTune5;
        bbValuesFineTune = bbValuesFineTune5;
        stoPeriodsFineTune = stoPeriodsFineTune5;
        stoPeriods2FineTune = stoPeriods2FineTune5;
        stoPeriods3FineTune = stoPeriods3FineTune5;
        stoPeriods4FineTune = stoPeriods4FineTune5;
        stoValuesFineTune = stoValuesFineTune5;
        ruleVariations = getRuleVariationsFineTune(rule);
        break;
      case 6:
        maPeriodsFineTune = maPeriodsFineTune6;
        maValuesFineTune = maValuesFineTune6;
        rsiPeriodsFineTune = rsiPeriodsFineTune6;
        rsiValuesFineTune = rsiValuesFineTune6;
        macdPeriodsFineTune = macdPeriodsFineTune6;
        macdPeriods2FineTune = macdPeriods2FineTune6;
        macdPeriods3FineTune = macdPeriods3FineTune6;
        macdValuesFineTune = macdValuesFineTune6;
        bbPeriodsFineTune = bbPeriodsFineTune6;
        bbPeriods2FineTune = bbPeriods2FineTune6;
        bbValuesFineTune = bbValuesFineTune6;
        stoPeriodsFineTune = stoPeriodsFineTune6;
        stoPeriods2FineTune = stoPeriods2FineTune6;
        stoPeriods3FineTune = stoPeriods3FineTune6;
        stoPeriods4FineTune = stoPeriods4FineTune6;
        stoValuesFineTune = stoValuesFineTune6;
        ruleVariations = getRuleVariationsFineTune(rule);
        break;
      default:
        ruleVariations = getRuleVariations(rule);
        break;
    };
    rulesVariations.push(ruleVariations);
  }
  return rulesVariations;
}

function createStrategyVariationWithBuyRules(strategy, buyRules) {
  let newStrategy = {};
  newStrategy.name = strategyNameToUse;
  newStrategy.timeClose = strategy.timeClose;
  newStrategy.buyRules = [];
  newStrategy.sellRules = [];
  for (let buyRule of buyRules) {
    newStrategy.buyRules.push(buyRule);
  }
  newStrategy.stoploss = strategy.stoploss;
  newStrategy.trailingSl = strategy.trailingSl;
  newStrategy.target = strategy.target;
  newStrategy.ttarget = strategy.ttarget;
  return newStrategy;
}

function createStrategyVariationWithSellRules(finalStrategiesList, strategiesWithBuyOnly, sellRules) {
  for (let strategy of strategiesWithBuyOnly) {
    let newStrategy = {};
    newStrategy.name = strategy.name;
    newStrategy.timeClose = strategy.timeClose;
    newStrategy.buyRules = [];
    newStrategy.sellRules = [];
    for (let buyRule of strategy.buyRules) {
      newStrategy.buyRules.push(buyRule);
    }
    for (let sellRule of sellRules) {
      newStrategy.sellRules.push(sellRule);
    }
    newStrategy.stoploss = strategy.stoploss;
    newStrategy.trailingSl = strategy.trailingSl;
    newStrategy.target = strategy.target;
    newStrategy.ttarget = strategy.ttarget;
    finalStrategiesList.push(newStrategy);
  }
}

function createStrategyVariationWithStoplossRules(finalStrategiesList, strategiesWithBuySellOnly, fineTune) {
  let stoplosses = [];
  if (changeStoplossFine) {
    switch (fineTune) {
      case 0:
        stoplosses = [-0.7, 0, 0.7];
        break;
      case 1:
        stoplosses = [-0.4, 0.4];
        break;
      case 2:
        stoplosses = [-0.2, 0.2];
        break;
      case 3:
        stoplosses = [-0.15, 0.15];
        break;
      case 4:
        stoplosses = [-0.03, 0.03];
        break;
      case 5:
        stoplosses = [-0.01, 0.01];
        break;
    };
  } else {
    switch (fineTune) {
      case 0:
        stoplosses = stoplossesFineTune0;
        break;
      case 1:
        stoplosses = stoplossesFineTune1;
        break;
      case 2:
        stoplosses = stoplossesFineTune2;
        break;
      case 3:
        stoplosses = stoplossesFineTune3;
        break;
      case 4:
        stoplosses = stoplossesFineTune4;
        break;
      case 5:
        stoplosses = stoplossesFineTune5;
        break;
      case 6:
        stoplosses = stoplossesFineTune6;
        break;
      default:
        break;
    };
  }

  for (let stoploss of stoplosses) {
    for (let strategy of strategiesWithBuySellOnly) {
      let newStrategy = {};
      newStrategy.name = strategy.name;
      newStrategy.timeClose = strategy.timeClose;
      newStrategy.buyRules = [];
      newStrategy.sellRules = [];
      for (let buyRule of strategy.buyRules) {
        newStrategy.buyRules.push(buyRule);
      }
      for (let sellRule of strategy.sellRules) {
        newStrategy.sellRules.push(sellRule);
      }
      if (fineTune > 0 || changeStoplossFine) {
        if (useTrailingStop) {
          newStrategy.trailingSl = fixNumber(strategy.trailingSl + stoploss, 2);
        } else {
          newStrategy.stoploss = fixNumber(strategy.stoploss + stoploss, 2);
        }
        newStrategy.target = strategy.target;
        newStrategy.ttarget = strategy.ttarget;
      } else {
        if (useTrailingStop) {
          newStrategy.trailingSl = stoploss;
        } else {
          newStrategy.stoploss = stoploss;
        }
        newStrategy.target = strategy.target;
        newStrategy.ttarget = strategy.ttarget;
      }
      finalStrategiesList.push(newStrategy);
    }
  }
  return finalStrategiesList;
}

function createStrategyVariationWithTargetRules(finalStrategiesList, strategiesWithBuySellOnly, fineTune) {
  let targets = [];
  let ttargets = [];
  if (changeTargetFine) {
    switch (fineTune) {
      case 0:
        targets = [-0.7, 0, 0.7];
        ttargets = [-0.7, 0, 0.7];
        break;
      case 1:
        targets = [-0.4, 0.4];
        ttargets = [-0.4, 0.4];
        break;
      case 2:
        targets = [-0.2, 0.2];
        ttargets = [-0.2, 0.2];
        break;
      case 3:
        targets = [-0.15, 0.15];
        ttargets = [-0.15, 0.15];
        break;
      case 4:
        targets = [-0.03, 0.03];
        ttargets = [-0.03, 0.03];
        break;
      case 5:
        targets = [-0.01, 0.01];
        ttargets = [-0.01, 0.01];
        break;
    };
  } else {
    switch (fineTune) {
      case 0:
        targets = targetsFineTune0;
        ttargets = ttargetsFineTune0;
        break;
      case 1:
        targets = targetsFineTune1;
        ttargets = ttargetsFineTune1;
        break;
      case 2:
        targets = targetsFineTune2;
        ttargets = ttargetsFineTune2;
        break;
      case 3:
        targets = targetsFineTune3;
        ttargets = ttargetsFineTune3;
        break;
      case 4:
        targets = targetsFineTune4;
        ttargets = ttargetsFineTune4;
        break;
      case 5:
        targets = targetsFineTune5;
        ttargets = ttargetsFineTune5;
        break;
      case 6:
        targets = targetsFineTune6;
        ttargets = ttargetsFineTune6;
        break;
      default:
        break;
    };
  }
  for (let target of targets) {
    for (let strategy of strategiesWithBuySellOnly) {
      if (useTrailingTarget) {
        for (let ttarget of ttargets) {
          let newStrategy = createStrategyWithTarget(target, ttarget, strategy, fineTune);
          if (newStrategy != null) {
            finalStrategiesList.push(newStrategy);
          }
        }
      } else {
        let newStrategy = createStrategyWithTarget(target, null, strategy, fineTune);
        finalStrategiesList.push(newStrategy);
      }
    }
  }
  return finalStrategiesList;
}

function createStrategyWithTarget(target, ttarget, strategy, fineTune) {
  let newStrategy = {};
  newStrategy.name = strategy.name;
  newStrategy.timeClose = strategy.timeClose;
  newStrategy.buyRules = [];
  newStrategy.sellRules = [];
  for (let buyRule of strategy.buyRules) {
    newStrategy.buyRules.push(buyRule);
  }
  for (let sellRule of strategy.sellRules) {
    newStrategy.sellRules.push(sellRule);
  }
  if (useTrailingStop) {
    newStrategy.trailingSl = strategy.trailingSl;
  } else {
    newStrategy.stoploss = strategy.stoploss;
  }
  if (fineTune > 0 || changeTargetFine) {
    newStrategy.target = fixNumber(strategy.target + target, 2);
    if (ttarget != null) {
      newStrategy.ttarget = fixNumber(strategy.ttarget + ttarget, 2);
    }
  } else {
    newStrategy.target = target;
    if (ttarget != null) {
      newStrategy.ttarget = ttarget;
    }
  }
  if (ttarget != null && (newStrategy.ttarget > newStrategy.target || newStrategy.ttarget <= 0)) {
    newStrategy = null;
  }
  return newStrategy;
}

async function incrementCounterWithSleep(counter) {
  if (counter > 500 && counter % 500 == 0) {
    await sleep(0);
  }
  return counter + 1;
}

async function getStrategyVariations(strategy, fineTune) {
  try {
    let buyRulesVariations = getRulesVariations(strategy.buyRules, fineTune);
    let sellRulesVariations = getRulesVariations(strategy.sellRules, fineTune);
    let strategiesWithBuyRuleVariations = [];
    let strategiesWithBuySellRuleVariations = [];
    let counter = 0;
    for (let ruleVariations of buyRulesVariations[0]) {
      if (buyRulesVariations.length > 1) {
        for (let rule2Variations of buyRulesVariations[1]) {
          if (buyRulesVariations.length > 2) {
            for (let rule3Variations of buyRulesVariations[2]) {
              if (buyRulesVariations.length > 3) {
                for (let rule4Variations of buyRulesVariations[3]) {
                  if (buyRulesVariations.length > 4) {
                    for (let rule5Variations of buyRulesVariations[4]) {
                      counter = await incrementCounterWithSleep(counter);
                      strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations, rule2Variations, rule3Variations, rule4Variations, rule5Variations]));
                    }
                  } else {
                    counter = await incrementCounterWithSleep(counter);
                    strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations, rule2Variations, rule3Variations, rule4Variations]));
                  }
                }
              } else {
                counter = await incrementCounterWithSleep(counter);
                strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations, rule2Variations, rule3Variations]));
              }
            }
          } else {
            counter = await incrementCounterWithSleep(counter);
            strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations, rule2Variations]));
          }
        }
      } else {
        counter = await incrementCounterWithSleep(counter);
        strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations]));
      }
    }
    if (sellRulesVariations.length !== 0) {
      for (let ruleVariations of sellRulesVariations[0]) {
        if (sellRulesVariations.length > 1) {
          for (let rule2Variations of sellRulesVariations[1]) {
            if (sellRulesVariations.length > 2) {
              for (let rule3Variations of sellRulesVariations[2]) {
                if (sellRulesVariations.length > 3) {
                  for (let rule4Variations of sellRulesVariations[3]) {
                    counter = await incrementCounterWithSleep(counter);
                    createStrategyVariationWithSellRules(strategiesWithBuySellRuleVariations, strategiesWithBuyRuleVariations, [ruleVariations, rule2Variations, rule3Variations, rule4Variations]);
                  }
                } else {
                  counter = await incrementCounterWithSleep(counter);
                  createStrategyVariationWithSellRules(strategiesWithBuySellRuleVariations, strategiesWithBuyRuleVariations, [ruleVariations, rule2Variations, rule3Variations]);
                }
              }
            } else {
              counter = await incrementCounterWithSleep(counter);
              createStrategyVariationWithSellRules(strategiesWithBuySellRuleVariations, strategiesWithBuyRuleVariations, [ruleVariations, rule2Variations]);
            }
          }
        } else {
          counter = await incrementCounterWithSleep(counter);
          createStrategyVariationWithSellRules(strategiesWithBuySellRuleVariations, strategiesWithBuyRuleVariations, [ruleVariations]);
        }
      }
    } else {
      strategiesWithBuySellRuleVariations = strategiesWithBuyRuleVariations;
    }

    if (changeStoploss) {
      let strategiesWithBuySellAndStoplossRuleVariations = [];
      createStrategyVariationWithStoplossRules(strategiesWithBuySellAndStoplossRuleVariations, strategiesWithBuySellRuleVariations, fineTune);
      strategiesWithBuySellRuleVariations = strategiesWithBuySellAndStoplossRuleVariations;
    }

    if (changeTarget) {
      let strategiesWithBuySellAndTargetsRuleVariations = [];
      createStrategyVariationWithTargetRules(strategiesWithBuySellAndTargetsRuleVariations, strategiesWithBuySellRuleVariations, fineTune);
      strategiesWithBuySellRuleVariations = strategiesWithBuySellAndTargetsRuleVariations;
    }

    return strategiesWithBuySellRuleVariations;

  } catch (err) {
    log('error', 'getStrategyVariations', err.stack);
  }
}

function opResultShowRows(from, to) {
  $('#opStrategiesTable').html('<thead><tr><td>Strategy</td><td>Total Return</td><td>Max Drawdown</td><td>Winning %</td><td>Avg. Trade</td><td>Best Trade</td><td>Worst Trade</td><td>Trades N.</td><td>Save</td></tr></thead><tbody>');
  for (let i = from; i < Math.min(strategyVariationsResults.length, to); i++) {

    let res = strategyVariationsResults[i];
    let classes = '';
    let resultClass = '';
    if (res.totalReturn > 0) {
      classes = 'text-green fas fa-thumbs-up';
      resultClass = 'text-green';
    } else if (res.totalReturn < 0) {
      classes = 'text-red fas fa-thumbs-down';
      resultClass = 'text-red';
    }

    let maxDdClass = res.maxDrawdown < 0
      ? 'text-red'
      : '';
    let winningClass = res.winningPercent >= 50
      ? 'text-green'
      : 'text-red';
    let avgGainLossPerTradeClass = res.avgGainLossPerTrade > 0
      ? 'text-green'
      : res.avgGainLossPerTrade < 0
        ? 'text-red'
        : '';
    $('#opStrategiesTable').append('<tr><td>' + (
    i + 1) + '&nbsp;<i class="' + classes + '"></td><td class="' + resultClass + '">' + res.totalReturn.toFixed(2) + '%</td><td class="' + maxDdClass + '">' + res.maxDrawdown.toFixed(2) + '%</td><td class="' + winningClass + '">' + res.winningPercent.toFixed(2) + '%</td><td class="' + avgGainLossPerTradeClass + '">' + res.avgGainLossPerTrade.toFixed(2) + '%</td><td class="text-green">' + res.biggestGain.toFixed(2) + '%</td><td class="text-red">' + res.biggestLost.toFixed(2) + '%</td><td>' + res.executedTrades + '</td><td><a  href="#/" onclick="openOpStrategy(' + i + ')"><i class="fas fa-save"></i></a></td></tr>');
  }
  $('#opStrategiesTable').append('</tbody>');
}

async function terminateOpWorkers() {
  try {
    await opWorkerTerminateMutex.lock();
    opExecutionCanceled = true;
    for (let i = 0; i < maxOpWorkers; i++) {
      if (opExecutionWorkers[i] !== undefined) {
        opExecutionWorkers[i].postMessage(['STOP']);
      }
    }
    while (runningWorkiers > 0) {
      await sleep(500);
    }
    if (fineTune >= fineTuneMaxCycles) {
      optimizationRunning = false;
      $('#runOptBtn').removeClass('disabled');
      $('#opCancelBtn').removeClass('disabled');
    }
  } catch (err) {
    log('error', 'terminateOpWorkers', err.stack);
  } finally {
    opWorkerTerminateMutex.release();
  }
}

async function fillOptimizationResult(marketReturn) {
  try {
    optimizationRunning = false;
    $('#opCancelBtn').addClass('disabled');

    for (let res of strategyVariationsIntermitBestResults) {
      strategyVariationsResults.push(res);
    }
    strategyVariationsIntermitBestResults = [];

    strategyVariationsResults.sort(function(a, b) {
      return compareStrategyResults(a, b)
    });
    let strategiesTmpList = [];
    let resultTmp = [];
    let rowsShown = 100;

    for (let res of strategyVariationsResults) {
      let pushedRes = pushNewStrategyVariation(strategiesTmpList, res.strategy);
      if (pushedRes) {
        resultTmp.push(res);
      }
      if (resultTmp.length == rowsShown) {
        break;
      }
    }
    strategyVariationsResults = resultTmp;
    resultTmp = [];
    strategiesTmpList = [];

    optType = 'return';
    strategyVariationsResults.sort(function(a, b) {
      return compareStrategyResults(a, b)
    });
    opResultShowRows(0, rowsShown);
    //pagination
    $('#opStrategiesTableNav').html('');
    let rowsTotal = strategyVariationsResults.length;
    /*let numPages = rowsTotal / rowsShown;
    for (let i = 0; i < numPages; i++) {
      var pageNum = i + 1;
      $('#opStrategiesTableNav').append('<a href="#/" rel="' + i + '">' + pageNum + '</a> ');
    }
    $('#opStrategiesTableNav a:first').addClass('active');
    $('#opStrategiesTableNav a').bind('click', function() {
      $('#opStrategiesTableNav a').removeClass('active');
      $(this).addClass('active');
      let currPage = $(this).attr('rel');
      let startItem = currPage * rowsShown;
      let endItem = startItem + rowsShown;
      opResultShowRows(startItem, endItem);
    });*/

    let marketReturnClass = marketReturn > 0
      ? 'text-green'
      : marketReturn < 0
        ? 'text-red'
        : '';
    //'Tested ' + strategyVariationsTested + ' variations.

    if (strategyVariationsResults.length > 0) {
      $('#opResultH').html('Showing top 100 of the optimized strategies. Market Return for the same period: <span class="' + marketReturnClass + '">' + marketReturn.toFixed(2) + '%</span>');
      $('#opStrategiesTable').show();
    } else {
      $('#opResultH').html('The optimiaztion didn\'t generate any strategies with positive return.');
      $('#opStrategiesTable').hide();
    }

    await terminateOpWorkers();
    /*strategyVariations = [];
    let resTmp = []
    for (let i = 0; i < Math.min(rowsShown, strategyVariationsResults.length); i++) {
      resTmp.push(strategyVariationsResults[0]);
    }
    strategyVariationsResults = [];
    strategyVariationsResults = resTmp;*/
    $('#opRunning').hide();
    $('#opResult').show();
  } catch (err) {
    log('error', 'fillOptimizationResult', err.stack);
    openModalInfo('Internal Error Occurred!<br>' + err.stack);
  }
}

async function editOpStrategy() {
  try {
    let strategyName = $('#opStrategyCombobox').text();
    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy to Edit!');
      $('#opStrategyCombobox').html('Choose Strategy');
      return;
    }
    editStrategy(strategyName);
  } catch (err) {
    log('error', 'editOpStrategy', err.stack);
  }
}

async function opCancel() {
  $('#opCancelBtn').addClass('disabled');
  $('#opRunPercent').html('Stopping Optimization..');
  $('#opRunRemaining').html('&nbsp;');
  await sleep(1000);
  cancelGetBinanceData();
  fineTune = fineTuneMaxCycles;
  await terminateOpWorkers();
  strategyVariations = [];
  strategyVariationsResults = [];
  strategyVariationsIntermitBestResults = [];
  $('#opResultDiv').hide();
  $('#opExecInfo').show();
}

function openOpStrategy(index) {
  openStrategyVariationStrategy(strategyVariationsResults[index].strategy)
}

function opOptInfo() {
  openModalInfoBig('<h2 class="text-center">Optimization Type:</h2><strong>Max Return</strong> - optimize the parameters to find the strategies that generate the highest return.<br><strong>Smooth</strong> - optimize the parameters to find the strategies that generate relatively consistent trades. Usually, those strategies generate less return but they have more predictable and smooth results.<br><strong>Risk/Reward</strong> - optimize the parameters to find the strategies that generate the highest return for the lowest drawdown.');
}
function opOptTypeInfo(field) {
  openModalInfoBig('<h2 class="text-center">' + field + ' Type:</h2><strong>Don\'t change</strong> - the provided ' + field.toLowerCase() + ' will not be changed.<br><strong>Change</strong> - uses wide range of values to create strategy variations.<br>' + '<strong>Fine Tune</strong> - uses values close to the provided ' + field.toLowerCase() + ' in the original strategy.');
}

function opCpuInfo() {
  openModalInfoBig('<div class="text-center"><h2>CPU Usage</h2></div><strong>One Core</strong> - uses only one CPU core. Will run slowly but will not consume much CPU power.<br><strong>1/2 Cores</strong> - uses 1/2 of your total CPU cores. Runs faster but consumes more resources.<br><strong>All Cores</strong> - uses all of your CPU cores - 1. The fastest option but it is recommended to avoid using additional applications when using this feature.');
}

function fillOpTestPeriod() {
  if ($('#opFromDate').val().length > 0) {
    return;
  }
  try {
    let startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    let day = ("0" + startDate.getDate()).slice(-2);
    let month = ("0" + (
    startDate.getMonth() + 1)).slice(-2);
    let startDateStr = startDate.getFullYear() + "-" + (
    month) + "-" + (
    day);
    $('#opFromDate').val(startDateStr);

    let toDate = new Date();
    day = ("0" + toDate.getDate()).slice(-2);
    month = ("0" + (
    toDate.getMonth() + 1)).slice(-2);
    let toDateStr = toDate.getFullYear() + "-" + (
    month) + "-" + (
    day);
    $('#opToDate').val(toDateStr);

  } catch (err) {
    log('error', 'fillOpTestPeriod', err.stack);
  }
}
