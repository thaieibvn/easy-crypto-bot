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
    if (result !== null && result.totalReturn > 0) {
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
let stoplossVariations;
let etaLastDate = null;
let etaStr = '';
let etaLastNum = null;
let strategyNameToUse = '';
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
  } else if ($('#opTypeConsistency').is(':checked')) {
    optType = 'consistency';
  } else if ($('#opTypeRiskReward').is(':checked')) {
    optType = 'riskReward';
  } else if ($('#opTypeSpikes').is(':checked')) {
    optType = 'spikes';
  }

  stoplossVariations = $('#opChangeStoplossYes').is(':checked');

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

    let rulesNumber = strategy.buyRules.length + strategy.sellRules.length;
    if (rulesNumber > 5) {
      openModalInfo('The Optimization feature is not available for strategies that have more than 5 rules. If you want to use this feature, please, edit your strategy!');
      $('#runOptBtn').removeClass('disabled');
      $('#opRunning').hide();
      $('#opResult').hide();
      optimizationRunning = false;
      return;
    }

    if (stoplossVariations && rulesNumber > 4) {
      openModalInfo('The Stoploss & Target Change option is not available for strategies that have more than 4 rules. If you want to use this option, please, edit your strategy!');
      $('#runOptBtn').removeClass('disabled');
      $('#opRunning').hide();
      $('#opResult').hide();
      optimizationRunning = false;
      $("#opChangeStoplossNo").prop("checked", true);
      return;
    }

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
    strategyVariations = getStrategyVariations(strategy, fineTune, stoplossVariations);
    strategyVariationsTested = strategyVariations.length;

    strategyVariationsResults = [];
    opExecutedIndex = 0;
    opExecutionCanceled = false;
    opCompleted = 0;
    etaLastDate = null;
    etaStr = '';
    etaLastNum = null;
    //Initialize webworkers
    if (!webWorkersInitialized) {
      let cpus = os.cpus().length;
      maxOpWorkers = cpus > 1
        ? cpus / 2
        : 1;

      for (let i = 0; i < maxOpWorkers; i++) {
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
              if (percentCompleted > (100 / (fineTuneMaxCycles + 1))) {
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
              }
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

function getStrategyVariationsFromResult(biggestTradeMultiplier, strategiesToAdd) {
  let addedStrategies = 0;
  let result = [];
  for (let strategyRes of strategyVariationsResults) {
    if (strategyRes.biggestGain * biggestTradeMultiplier > strategyRes.totalReturn) {
      continue;
    }

    let strategyVariationsTmp = getStrategyVariations(strategyRes.strategy, fineTune, stoplossVariations);
    for (let strategyTmp of strategyVariationsTmp) {
      result.push(strategyTmp);
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
  } else if (optType === 'spikes') {
    ratioA = a.totalReturn * a.biggestGain;
    ratioB = b.totalReturn * b.biggestGain;

  } else if (optType === 'consistency') {
    let returnWithoutBestTradeA = a.totalReturn - a.biggestGain;
    let returnWithoutBestTradeB = b.totalReturn - b.biggestGain;

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

    let strategiesToAdd = 5;

    let strategyVariationsTmp = [];
    if (optType === 'consistency') {
      strategyVariationsTmp = getStrategyVariationsFromResult(4, strategiesToAdd);
      if (strategyVariationsTmp.length === 0) {
        strategyVariationsTmp = getStrategyVariationsFromResult(3, strategiesToAdd);
        if (strategyVariationsTmp.length === 0) {
          strategyVariationsTmp = getStrategyVariationsFromResult(2, strategiesToAdd);
          if (strategyVariationsTmp.length === 0) {
            strategyVariationsTmp = getStrategyVariationsFromResult(1, strategiesToAdd);
            if (strategyVariationsTmp.length === 0) {
              strategyVariationsTmp = getStrategyVariationsFromResult(0, strategiesToAdd);
            }
          }
        }
      }
    } else {
      strategyVariationsTmp = getStrategyVariationsFromResult(0, strategiesToAdd);
    }

    for (let strategyTmp of strategyVariationsTmp) {
      strategyVariations.push(strategyTmp);
    }
    strategyVariationsTested += strategyVariationsTmp.length;

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

function createRuleVariation(rule, period, value, crossDirection, type2, period2, period3) {
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
  }

  return ruleVariations;
}

let fineTuneMaxCycles = 3;

let maPeriods = [10, 29, 48];
let maValues = [1, 3];

let rsiPeriods = [6, 15, 24];
let rsiValues = [25, 56, 77];

let macdPeriods = [6, 15, 24];
let macdPeriods2 = [10, 19, 28];
let macdPeriods3 = [6, 15];
let macdValues = [1, 3];

let bbPeriods = [10, 29, 48];
let bbPeriods2 = [1, 3];
let bbValues = [1, 3];

//Fina tune values

let maPeriodsFineTune = [];
let maValuesFineTune = [];
let maPeriodsFineTune1 = [-5, 0, 5];
let maValuesFineTune1 = [-0.5, 0, 0.5];
let maPeriodsFineTune2 = [-3, 0, 3];
let maValuesFineTune2 = [-0.25, 0, 0.25];
let maPeriodsFineTune3 = [-1, 0, 1];
let maValuesFineTune3 = [-0.1, 0, 0.1];

let rsiPeriodsFineTune = [];
let rsiValuesFineTune = [];
let rsiPeriodsFineTune1 = [-2, 0, 2];
let rsiValuesFineTune1 = [-8, 0, 8];
let rsiPeriodsFineTune2 = [-1, 0, 1];
let rsiValuesFineTune2 = [-5, 0, 5];
let rsiPeriodsFineTune3 = [-1, 0, 1];
let rsiValuesFineTune3 = [-2, 0, 2];

let macdPeriodsFineTune = [];
let macdPeriods2FineTune = [];
let macdPeriods3FineTune = [];
let macdValuesFineTune = [];

let macdPeriodsFineTune1 = [-2, 0, 2];
let macdPeriods2FineTune1 = [-2, 0, 2];
let macdPeriods3FineTune1 = [-2, 0, 2];
let macdValuesFineTune1 = [-0.5, 0, 0.5];

let macdPeriodsFineTune2 = [-1, 0, 1];
let macdPeriods2FineTune2 = [-1, 0, 1];
let macdPeriods3FineTune2 = [-1, 0, 1];
let macdValuesFineTune2 = [-0.25, 0, 0.25];

let macdPeriodsFineTune3 = [-1, 0, 1];
let macdPeriods2FineTune3 = [-1, 0, 1];
let macdPeriods3FineTune3 = [-1, 0, 1];
let macdValuesFineTune3 = [0];

let bbPeriodsFineTune = [];
let bbPeriods2FineTune = [];
let bbValuesFineTune = [];

let bbPeriodsFineTune1 = [-5, 0, 5];
let bbPeriods2FineTune1 = [-0.5, 0, 0.5];
let bbValuesFineTune1 = [-0.5, 0, 0.5];

let bbPeriodsFineTune2 = [-3, 0, 3];
let bbPeriods2FineTune2 = [-0.25, 0, 0.25];
let bbValuesFineTune2 = [-0.25, 0, 0.25];

let bbPeriodsFineTune3 = [-1, 0, 1];
let bbPeriods2FineTune3 = [-0.1, 0, 0.1];
let bbValuesFineTune3 = [-0.1, 0, 0.1];

let stoplossesFineTune0 = [2, 4.5, 7];
let stoplossesFineTune1 = [-0.5, 0, 0.5];
let stoplossesFineTune2 = [-0.25, 0, 0.25];
let stoplossesFineTune3 = [-0.25, 0, 0.25];

let targetsFineTune0 = [3, 8.5, 14];
let targetsFineTune1 = [-1, 0, 1];
let targetsFineTune2 = [-1, 0, 1];
let targetsFineTune3 = [-0.5, 0, 0.5];

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
          if (valueToUse === 0) {
            valueToUse = 0.1
          }
          ruleVariations.push(createRuleVariation(rule, periodToUse, valueToUse));
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
        ruleVariations.push(createRuleVariation(rule, periodToUse, rule.value + value));
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
                if (valueToUse === 0) {
                  valueToUse = 0.1
                }
                ruleVariations.push(createRuleVariation(rule, periodToUse, valueToUse, null, null, periodToUse2, periodToUse3));
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
            if (valueToUse === 0) {
              valueToUse = 0.1
            }
            ruleVariations.push(createRuleVariation(rule, periodToUse, valueToUse, null, null, periodToUse2, null));
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
    finalStrategiesList.push(newStrategy);
  }
}

function createStrategyVariationWithStoplossRules(finalStrategiesList, strategiesWithBuySellOnly, fineTune) {
  let stoplosses = [];
  let targets = [];

  switch (fineTune) {
    case 0:
      stoplosses = stoplossesFineTune0;
      targets = targetsFineTune0;
      break;
    case 1:
      stoplosses = stoplossesFineTune1;
      targets = targetsFineTune1;
      break;
    case 2:
      stoplosses = stoplossesFineTune2;
      targets = targetsFineTune2;
      break;
    case 3:
      stoplosses = stoplossesFineTune3;
      targets = targetsFineTune3;
      break;
    default:
      break;
  };
  let useTrailingStop = strategiesWithBuySellOnly.length > 0 && strategiesWithBuySellOnly[0].trailingSl !== null && !isNaN(strategiesWithBuySellOnly[0].trailingSl);
  for (let stoploss of stoplosses) {
    for (let target of targets) {
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
        if (fineTune > 0) {
          if (useTrailingStop) {
            newStrategy.trailingSl = strategy.trailingSl + stoploss;
          } else {
            newStrategy.stoploss = strategy.stoploss + stoploss;
          }
          newStrategy.target = strategy.target + target;
        } else {
          if (useTrailingStop) {
            newStrategy.trailingSl = stoploss;
          } else {
            newStrategy.stoploss = stoploss;
          }
          newStrategy.target = target;
        }

        finalStrategiesList.push(newStrategy);
      }
    }
  }
  return finalStrategiesList;
}

function getStrategyVariations(strategy, fineTune, stoplossVariations) {
  try {
    let buyRulesVariations = getRulesVariations(strategy.buyRules, fineTune);
    let sellRulesVariations = getRulesVariations(strategy.sellRules, fineTune);
    let strategiesWithBuyRuleVariations = [];
    let strategiesWithBuySellRuleVariations = [];
    for (let ruleVariations of buyRulesVariations[0]) {
      if (buyRulesVariations.length > 1) {
        for (let rule2Variations of buyRulesVariations[1]) {
          if (buyRulesVariations.length > 2) {
            for (let rule3Variations of buyRulesVariations[2]) {
              if (buyRulesVariations.length > 3) {
                for (let rule4Variations of buyRulesVariations[3]) {
                  if (buyRulesVariations.length > 4) {
                    for (let rule5Variations of buyRulesVariations[4]) {
                      strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations, rule2Variations, rule3Variations, rule4Variations, rule5Variations]));
                    }
                  } else {
                    strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations, rule2Variations, rule3Variations, rule4Variations]));
                  }
                }
              } else {
                strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations, rule2Variations, rule3Variations]));
              }
            }
          } else {
            strategiesWithBuyRuleVariations.push(createStrategyVariationWithBuyRules(strategy, [ruleVariations, rule2Variations]));
          }
        }
      } else {
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
                    createStrategyVariationWithSellRules(strategiesWithBuySellRuleVariations, strategiesWithBuyRuleVariations, [ruleVariations, rule2Variations, rule3Variations, rule4Variations]);
                  }
                } else {
                  createStrategyVariationWithSellRules(strategiesWithBuySellRuleVariations, strategiesWithBuyRuleVariations, [ruleVariations, rule2Variations, rule3Variations]);
                }
              }
            } else {
              createStrategyVariationWithSellRules(strategiesWithBuySellRuleVariations, strategiesWithBuyRuleVariations, [ruleVariations, rule2Variations]);
            }
          }
        } else {
          createStrategyVariationWithSellRules(strategiesWithBuySellRuleVariations, strategiesWithBuyRuleVariations, [ruleVariations]);
        }
      }
    } else {
      strategiesWithBuySellRuleVariations = strategiesWithBuyRuleVariations;
    }

    if (stoplossVariations) {
      let strategiesWithBuySellAndStoplossRuleVariations = [];
      createStrategyVariationWithStoplossRules(strategiesWithBuySellAndStoplossRuleVariations, strategiesWithBuySellRuleVariations, fineTune);
      return strategiesWithBuySellAndStoplossRuleVariations;
    } else {
      return strategiesWithBuySellRuleVariations;
    }

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

    strategyVariationsResults.sort(function(a, b) {
      return compareStrategyResults(a, b)
    });

    let rowsShown = 100;
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
    strategyVariations = [];
    let resTmp = []
    for (let i = 0; i < Math.min(rowsShown, strategyVariationsResults.length); i++) {
      resTmp.push(strategyVariationsResults[0]);
    }
    strategyVariationsResults = [];
    strategyVariationsResults = resTmp;
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
  $('#opResultDiv').hide();
  $('#opExecInfo').show();
}

function openOpStrategy(index) {
  openStrategyVariationStrategy(strategyVariationsResults[index].strategy)
}

function opOptInfo() {
  openModalInfoBig('<h2 class="text-center">Optimize For:</h2><strong>Max Return</strong> - optimize the parameters to find the strategies that generate the highest return.<br><br>' + '<strong>Risk/Reward</strong> - optimize the parameters to find the strategies that generate the highest return for the lowest drawdown.<br><br>' + '<strong>Consistency</strong> - optimize the parameters to find the strategies that generate relatively consistent trades. Usually, those strategies generate less return as they are not designed to catch price spikes but they have more predictable results. Use this type for stable coins whithout too many spikes in the price.<br><br>' + '<strong>Spikes</strong> - optimize the parameters to find the strategies that are able to catch spikes in the price of the asset. Use this for coins that do not have a stable price and have many spikes in the price.');
}
function opCpuInfo() {
  openModalInfoBig('<div class="text-center">CPU Use</div>1 Core - uses only 1 CPU core. Will run slower but will not consume much CPU power.<br>Half Cores - uses half of your CPU cores. Runs faster but you should close some of the running apps.<br>All Cores - uses all of your CPU cores. The fastest but you should close all other apps.');
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
