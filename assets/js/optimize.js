//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
//const os = require('os');

async function opFillBinanceInstruments() {
  await getBinanceInstruments();
}

async function opInstrumentKeyup() {
  try {
    let search = $('#opInstrumentSearch').val().toLowerCase();
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
  } catch (err) {}
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
    if (result !== null && result.executedTrades > 0) {
      strategyVariationsResults.push(result);
    }
    strategyVariationsResults.push(result);
    return opCompleted;
  } finally {
    addOpResultMutex.release();
  }
}

let strategyVariations = [];
let strategyVariationsResults = [];
let opExecutionCanceled = false;
let opExecutionWorkers = {};
let opExecutedIndex = 0;
let opCompleted = 0;
let maxOpWorkers = 1;
let optimizationRunning = false;
let workerIndex = 0;
const executionOpMutex = new Mutex();
const addOpResultMutex = new Mutex();
const opWorkerTerminateMutex = new Mutex();

function isOptimizationRunning() {
  return optimizationRunning;
}
async function runOptimize() {
  if (isBacktestRunning()) {
    openModalInfo('Cannot run optimization while executing backtest!');
    return;
  }
  if (hasTradingStrategies()) {
    let continueExecution = 0;
    openModalConfirmBig('You have realtime strategies running under Trade & Alerts tab. It is highly recommended to pause them before using the optimization feature, as it consumes a lot of your PC resources and the realtime execution may not be executed in time!<br><div class="text-center">Continue anyway?</div>', function() {
      continueExecution = 1
    }, function() {
      continueExecution = -1
    });

    while (continueExecution === 0) {
      await sleep(500);
      let continueExecution = 0;
    }
    if (continueExecution === -1) {
      return;
    }
  }

  $('#opCancelBtn').removeClass('disabled');
  let strategyName = $('#opStrategyCombobox').text();
  let exchange = $('#opExchangeCombobox').text();
  let instrument = $('#opInstrumentSearch').val().toUpperCase();
  let timeframe = $('#opTimeframeCombobox').text();
  if (strategyName === 'Choose Strategy') {
    openModalInfo('Please Choose a Strategy!');
    return;
  }
  if (exchange === 'Choose Exchange') {
    openModalInfo('Please Choose an Exchange!');
    return;
  }
  if (exchange === 'Binance') {
    let instruments = await getBinanceInstruments();
    if (!(instrument in instruments)) {
      openModalInfo('Invalid Instrument!<br>Please Choose an Instrument!');
      return;
    }
  }
  if (timeframe === 'Choose Timeframe') {
    openModalInfo('Please Choose Timeframe!');
    return;
  }
  let startDateStr = $('#opFromDate').val();
  let endDateStr = $('#opToDate').val();

  let startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) {
    openModalInfo('Please Choose a Start Date!');
    return;
  }
  startDate.setHours(0, 0, 0, 0);
  let endDate = new Date(endDateStr);

  if (isNaN(endDate.getTime())) {
    openModalInfo('Please Choose an End Date!');
    return;
  }
  if (startDate >= endDate) {
    openModalInfo('Start Date must be before End Date!');
    return;
  }
  endDate.setHours(0, 0, 0, 0);
  let endDateTmp = new Date(endDate.getTime());
  endDateTmp.setMonth(endDate.getMonth() - 3);
  endDateTmp.setDate(endDateTmp.getDate() - 1);
  if (startDate < endDateTmp) {
    openModalInfo('The maximum period is 3 months. Please change the selected dates.');
    return;
  }

  if (startDate >= endDate) {
    openModalInfo('Start Date must be before End Date!');
    return;
  }

  try {
    optimizationRunning = true;
    opExecutionCanceled = false;
    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy!');
      $('#opStrategyCombobox').html('Choose Strategy');
      optimizationRunning = false;
      return;
    }

    $('#runOptBtn').addClass('disabled');
    $('#opRunPercent').html('Starting Optimization..');
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
    let ticks = await getBinanceTicks(instrument, getTimeframe(timeframe), getStartDate(timeframe, startDate), endDate, false);
    if (opExecutionCanceled) {
      return;
    }
    if (ticks === null) {
      $('#runOptBtn').removeClass('disabled');
      $('#opRunning').hide();
      $('#opResult').hide();
      openModalInfo('Could not optain data from ' + exchange + ' for the given period. The period may be too long. Please try with smaller period or try later!');
      optimizationRunning = false;
      return;
    }
    let marketReturn = 0;
    for (let tick of ticks) {
      if (tick.d >= startDate) {
        marketReturn = ((ticks[ticks.length - 1].c - tick.o) / tick.o) * 100;
        break;
      }
    }

    $('#opRunPercent2').hide();
    $('#opRunPercent').html('Optimization Execution: 0%');
    $('#opRunRocket').show();

    strategyVariations = [];
    let fullOptimization = $('#opOptimizationFull').is(':checked');
    let changeStoploss = $('#opChangeStoplossYes').is(':checked');
    let rulesCount = (strategy.buyRules.length + strategy.sellRules.length);
    let maxStrategyVariations = 250000;
    for (let rule of strategy.buyRules) {
      let rulesTmp = fullOptimization
        ? getFullRulesVariations(rule, rulesCount, changeStoploss)
        : getFineTuneRulesVariations(rule, rulesCount, changeStoploss);
      strategyVariations = await getNewStrategyVariations(rulesTmp, strategyVariations, 'buy', strategy, instrument, getTimeframe(timeframe));
      if (checkTooManyVariations()) {
        optimizationRunning = false;
        return;
      }
    }
    for (let rule of strategy.sellRules) {
      let rulesTmp = fullOptimization
        ? getFullRulesVariations(rule, rulesCount, changeStoploss)
        : getFineTuneRulesVariations(rule, rulesCount, changeStoploss);
      strategyVariations = await getNewStrategyVariations(rulesTmp, strategyVariations, 'sell', strategy, instrument, getTimeframe(timeframe));
      if (checkTooManyVariations()) {
        optimizationRunning = false;
        return;
      }
    }
    if (changeStoploss) {
      strategyVariations = fullOptimization
        ? await getFullStoplossAndTargetVariations(strategyVariations, rulesCount)
        : await getFineTuneStoplossAndTargetVariations(strategyVariations, strategy, rulesCount);
    }
    if (checkTooManyVariations()) {
      optimizationRunning = false;
      return;
    }
    //alert(strategyVariations.length);
    strategyVariationsResults = [];
    opExecutedIndex = 0;
    opExecutionCanceled = false;
    opCompleted = 0;

    /*let cpus = os.cpus().length;
    if ($('#opOptimization1CPU').is(':checked')) {
      maxOpWorkers = 1;
    } else if ($('#opOptimizationHalfCPUs').is(':checked')) {
      maxOpWorkers = cpus > 1
        ? cpus / 2
        : 1;
    } else {
      maxOpWorkers = cpus > 1
        ? cpus - 1
        : 1;
    }*/

    for (let i = 0; i < Math.min(maxOpWorkers, strategyVariations.length); i++) {
      opExecutionWorkers[workerIndex] = new Worker("./assets/js/optimize-execution.js");
      opExecutionWorkers[workerIndex].addEventListener('error', async function(e) {
        openModalInfo('Internal Error Occurred!<br>' + e.message + '<br>' + e.filename + ' ' + e.lineno);
      }, false);
      opExecutionWorkers[workerIndex].addEventListener("message", async function(e) {
        try {
          if (typeof e.data === 'string' && e.data.startsWith('ERR')) {
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
            //opExecutionWorkers[e.data[1]].terminate();
            //opExecutionWorkers[e.data[1]] = undefined;
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

            $('#opRunPercent').html('Optimization Execution: ' + (
            (completed / strategyVariations.length) * 100).toFixed(0) + '%');

            if (completed === strategyVariations.length) {
              if (opExecutionCanceled) {
                return;
              }
              fillOptimizationResult(marketReturn);
            }

          } else {
            openModalInfo('Unexpected Internal Error Occurred!<br>' + e.data);
          }
        } catch (err) {
          openModalInfo('Internal Error Occurred!<br>' + err);
        } finally {
          executionOpMutex.release();
        }
      }, false);
      try {
        await opWorkerTerminateMutex.lock();
        if (opExecutionCanceled) {
          optimizationRunning = false;
          return;
        }
        opExecutionWorkers[workerIndex].postMessage(['INITIALIZE', workerIndex, timeframe, startDate, ticks]);
      } finally {
        opWorkerTerminateMutex.release();
      }
      workerIndex++;
    }

  } catch (err) {
    $('#opRunning').hide();
    optimizationRunning = false;
    await terminateOpWorkers();
    openModalInfo('Internal Error Occurred!<br>' + err);
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
    $('#opRunPercent').html('Stopping Optimization..');
    cancelGetBinanceData();
    opExecutionCanceled = true;
    optimizationRunning = false;

    Object.entries(opExecutionWorkers).forEach(([key, value]) => {
      if (value !== undefined) {
        opExecutionWorkers[key].postMessage(['STOP']);
        opExecutionWorkers[key] = undefined;
      }
    });

    $('#opRunPercent').html('Stopping Optimization..');
    await sleep(2000);
    $('#runOptBtn').removeClass('disabled');
    $('#opCancelBtn').removeClass('disabled');
  } catch (err) {
    alert(err);
  } finally {
    opWorkerTerminateMutex.release();
  }
}

async function fillOptimizationResult(marketReturn) {
  try {
    optimizationRunning = false;
    $('#opCancelBtn').addClass('disabled');

    strategyVariationsResults.sort(function(a, b) {
      return (a.totalReturn < b.totalReturn)
        ? 1
        : (
          (b.totalReturn < a.totalReturn)
          ? -1
          : 0);
    });

    let rowsShown = 100;
    opResultShowRows(0, rowsShown);
    //pagination
    $('#opStrategiesTableNav').html('');
    let rowsTotal = strategyVariationsResults.length;
    let numPages = rowsTotal / rowsShown;
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
    });

    $('#opRunning').hide();

    let marketReturnClass = marketReturn > 0
      ? 'text-green'
      : marketReturn < 0
        ? 'text-red'
        : '';

    $('#opResultH').html('Tested ' + strategyVariations.length + ' variations. Strategies that didn\'t generate trades are excluded.<br>Market Return for the same period: <span class="' + marketReturnClass + '">' + marketReturn.toFixed(2) + '%</span>');
    $('#opResult').show();

    await terminateOpWorkers();
  } catch (err) {
    openModalInfo('Internal Error Occurred!<br>' + err);
  }
}

function getFineTuneRulesVariations(rule, rulesCount, changeStoploss) {
  let rulesTmp = [];

  let rP = rule.period;
  let rP2 = rule.period2;
  let rP3 = rule.period3;
  let rV = rule.value;

  let maStepP = [
    rP - 3,
    rP,
    rP + 3
  ];
  let maStepV = [
    rV - 1,
    rV + 1
  ];
  let cmaStepP2 = [
    rP2 - 1,
    rP2,
    rP2 + 1
  ];
  let cmaStepP = [
    rP - 1,
    rP + 1
  ];
  let rsiStepP = [7, 10, 14];
  let rsiStepV = [30, 70];
  let macdStepP2 = [
    rP2 - 1,
    rP2,
    rP2 + 1
  ];
  let macdStepP = [
    rP - 1,
    rP,
    rP + 1
  ];
  let macdStepP3 = [rP3];
  let macdStepV = [rV];
  if (changeStoploss) {
    switch (rulesCount) {
      case 1:
        maStepP = [
          rP - 5,
          rP - 4,
          rP - 3,
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2,
          rP + 3,
          rP + 4,
          rP + 5
        ];
        maStepV = [
          rV - 3,
          rV - 2.5,
          rV - 2,
          rV - 1.5,
          rV - 1,
          rV - 0.5,
          rV - 0.25,
          rV,
          rV + 0.25,
          rV + 0.5,
          rV + 1,
          rV + 1.5,
          rV + 2,
          rV + 2.5,
          rV + 3
        ];
        cmaStepP2 = [
          rP2 - 5,
          rP2 - 4,
          rP2 - 3,
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2,
          rP2 + 3,
          rP2 + 4,
          rP2 + 5
        ];
        cmaStepP = [
          rP - 5,
          rP - 4,
          rP - 3,
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2,
          rP + 3,
          rP + 4,
          rP + 5
        ];
        rsiStepP = [
          rP - 5,
          rP - 4,
          rP - 3,
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2,
          rP + 3,
          rP + 4,
          rP + 5
        ];
        rsiStepV = [
          rV - 10,
          rV - 7,
          rV - 5,
          rV - 3,
          rV - 2,
          rV - 1,
          rV,
          rV + 1,
          rV + 2,
          rV + 3,
          rV + 5,
          rV + 7,
          rV + 10
        ];
        macdStepP2 = [
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2
        ];
        macdStepP = [
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2
        ];
        macdStepP3 = [
          rP3 - 2,
          rP3 - 1,
          rP3,
          rP3 + 1,
          rP3 + 2
        ];
        macdStepV = [
          rV - 1,
          rV - 0.5,
          rV,
          rV + 0.5,
          rV + 1
        ];
        break;
      case 2:
        maStepP = [
          rP - 5,
          rP - 3,
          rP - 2,
          rP,
          rP + 2,
          rP + 3,
          rP + 5
        ];
        maStepV = [
          rV - 1.5,
          rV - 1,
          rV - 0.5,
          rV,
          rV + 0.5,
          rV + 1,
          rV + 1.5
        ];
        cmaStepP2 = [
          rP2 - 3,
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2,
          rP2 + 3
        ];
        cmaStepP = [
          rP - 3,
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2,
          rP + 3
        ];
        rsiStepP = [
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2
        ];
        rsiStepV = [
          rV - 10,
          rV - 5,
          rV - 3,
          rV - 1,
          rV,
          rV + 1,
          rV + 3,
          rV + 5,
          rV + 10
        ];
        macdStepP2 = [
          rP2 - 1,
          rP2,
          rP2 + 1
        ];
        macdStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        macdStepP3 = [
          rP3 - 1,
          rP3,
          rP3 + 1
        ];
        macdStepV = [rV];
        break;
      case 3:
        maStepP = [
          rP - 3,
          rP,
          rP + 3
        ];
        maStepV = [
          rV - 1,
          rV - 0.5,
          rV,
          rV + 0.5,
          rV + 1
        ];
        cmaStepP2 = [
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2
        ];
        cmaStepP = [
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2
        ];
        rsiStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        rsiStepV = [
          rV - 5,
          rV - 3,
          rV - 1,
          rV,
          rV + 1,
          rV + 3,
          rV + 5
        ];
        macdStepP2 = [
          rP2 - 1,
          rP2,
          rP2 + 1
        ];
        macdStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        macdStepP3 = [
          rP3 - 1,
          rP3,
          rP3 + 1
        ];
        macdStepV = [rV];
        break;
      case 4:
        maStepP = [
          rP - 3,
          rP,
          rP + 3
        ];
        maStepV = [
          rV - 1,
          rV,
          rV + 1
        ];
        cmaStepP2 = [
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2
        ];
        cmaStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        rsiStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        rsiStepV = [
          rV - 3,
          rV,
          rV + 3
        ];
        break;
      default:
    }
  } else {
    switch (rulesCount) {
      case 1:
      case 2:
        maStepP = [
          rP - 5,
          rP - 4,
          rP - 3,
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2,
          rP + 3,
          rP + 4,
          rP + 5
        ];
        maStepV = [
          rV - 3,
          rV - 2.5,
          rV - 2,
          rV - 1.5,
          rV - 1,
          rV - 0.5,
          rV - 0.25,
          rV,
          rV + 0.25,
          rV + 0.5,
          rV + 1,
          rV + 1.5,
          rV + 2,
          rV + 2.5,
          rV + 3
        ];
        cmaStepP2 = [
          rP2 - 5,
          rP2 - 4,
          rP2 - 3,
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2,
          rP2 + 3,
          rP2 + 4,
          rP2 + 5
        ];
        cmaStepP = [
          rP - 5,
          rP - 4,
          rP - 3,
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2,
          rP + 3,
          rP + 4,
          rP + 5
        ];
        rsiStepP = [
          rP - 5,
          rP - 4,
          rP - 3,
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2,
          rP + 3,
          rP + 4,
          rP + 5
        ];
        rsiStepV = [
          rV - 10,
          rV - 7,
          rV - 5,
          rV - 3,
          rV - 2,
          rV - 1,
          rV,
          rV + 1,
          rV + 2,
          rV + 3,
          rV + 5,
          rV + 7,
          rV + 10
        ];
        macdStepP2 = [
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2
        ];
        macdStepP = [
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2
        ];
        macdStepP3 = [
          rP3 - 2,
          rP3 - 1,
          rP3,
          rP3 + 1,
          rP3 + 2
        ];
        macdStepV = [
          rV - 1,
          rV - 0.5,
          rV,
          rV + 0.5,
          rV + 1
        ];
        break;
      case 3:
        maStepP = [
          rP - 5,
          rP - 3,
          rP - 2,
          rP,
          rP + 2,
          rP + 3,
          rP + 5
        ];
        maStepV = [
          rV - 1.5,
          rV - 1,
          rV - 0.5,
          rV,
          rV + 0.5,
          rV + 1,
          rV + 1.5
        ];
        cmaStepP2 = [
          rP2 - 3,
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2,
          rP2 + 3
        ];
        cmaStepP = [
          rP - 3,
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2,
          rP + 3
        ];
        rsiStepP = [
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2
        ];
        rsiStepV = [
          rV - 10,
          rV - 5,
          rV - 3,
          rV - 1,
          rV,
          rV + 1,
          rV + 3,
          rV + 5,
          rV + 10
        ];
        macdStepP2 = [
          rP2 - 1,
          rP2,
          rP2 + 1
        ];
        macdStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        macdStepP3 = [
          rP3 - 1,
          rP3,
          rP3 + 1
        ];
        macdStepV = [rV];
        break;
      case 4:
        maStepP = [
          rP - 3,
          rP,
          rP + 3
        ];
        maStepV = [
          rV - 1,
          rV - 0.5,
          rV,
          rV + 0.5,
          rV + 1
        ];
        cmaStepP2 = [
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2
        ];
        cmaStepP = [
          rP - 2,
          rP - 1,
          rP,
          rP + 1,
          rP + 2
        ];
        rsiStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        rsiStepV = [
          rV - 5,
          rV - 3,
          rV - 1,
          rV,
          rV + 1,
          rV + 3,
          rV + 5
        ];
        macdStepP2 = [
          rP2 - 1,
          rP2,
          rP2 + 1
        ];
        macdStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        macdStepP3 = [
          rP3 - 1,
          rP3,
          rP3 + 1
        ];
        macdStepV = [rV];
        break;
      case 5:
        maStepP = [
          rP - 3,
          rP,
          rP + 3
        ];
        maStepV = [
          rV - 1,
          rV,
          rV + 1
        ];
        cmaStepP2 = [
          rP2 - 2,
          rP2 - 1,
          rP2,
          rP2 + 1,
          rP2 + 2
        ];
        cmaStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        rsiStepP = [
          rP - 1,
          rP,
          rP + 1
        ];
        rsiStepV = [
          rV - 3,
          rV,
          rV + 3
        ];
        break;
      default:
    }
  }

  if (rule.indicator === 'sma' || rule.indicator === 'ema') {
    for (let p of maStepP) {
      if (p < 2) {
        continue;
      }
      if (rule.direction !== 'crossing') {
        for (let v of maStepV) {
          if (v < 0.1) {
            continue;
          }
          let ruleTmp = {};
          ruleTmp.indicator = rule.indicator;
          ruleTmp.direction = rule.direction;
          ruleTmp.crossDirection = rule.crossDirection;
          ruleTmp.period = p;
          ruleTmp.value = v;
          rulesTmp.push(ruleTmp);
        }
      } else {
        let ruleTmp = {};
        ruleTmp.indicator = rule.indicator;
        ruleTmp.direction = rule.direction;
        ruleTmp.crossDirection = rule.crossDirection;
        ruleTmp.period = p;
        rulesTmp.push(ruleTmp);
      }
    }
  } else if (rule.indicator === "cma") {
    for (let p2 of cmaStepP2) {
      if (p2 < 2) {
        continue;
      }
      for (let p of cmaStepP) {
        if (p < 2 || p >= p2) {
          continue;
        }
        let ruleTmp = {};
        ruleTmp.indicator = rule.indicator;
        ruleTmp.type = rule.type;
        ruleTmp.type2 = rule.type2;
        ruleTmp.crossDirection = rule.crossDirection;
        ruleTmp.period = p;
        ruleTmp.period2 = p2;
        rulesTmp.push(ruleTmp);

      }
    }
  } else if (rule.indicator === "rsi") {

    for (let p of rsiStepP) {
      if (p < 2) {
        continue;
      }
      for (let v of rsiStepV) {
        if (v < 2) {
          continue;
        }
        let ruleTmp = {};
        ruleTmp.indicator = rule.indicator;
        ruleTmp.direction = rule.direction;
        ruleTmp.crossDirection = rule.crossDirection;
        ruleTmp.period = p;
        ruleTmp.value = v;
        rulesTmp.push(ruleTmp);
      }
    }
  } else if (rule.indicator === "macd") {
    for (let p2 of macdStepP2) {
      if (p2 < 2) {
        continue;
      }
      for (let p of macdStepP) {
        if (p < 2 || p >= p2) {
          continue;
        }
        if (rule.type === 'signal line') {
          for (let p3 of macdStepP3) {
            if (p3 < 2) {
              continue;
            }
            if (rule.direction !== 'crossing') {
              for (let v of macdStepV) {
                if (v < 0.1) {
                  continue;
                }
                let ruleTmp = {};
                ruleTmp.indicator = rule.indicator;
                ruleTmp.type = rule.type;
                ruleTmp.direction = rule.direction;
                ruleTmp.crossDirection = rule.crossDirection;
                ruleTmp.period = p;
                ruleTmp.period2 = p2;
                ruleTmp.period3 = p3;
                ruleTmp.value = v;
                rulesTmp.push(ruleTmp);
              }
            } else {
              let ruleTmp = {};
              ruleTmp.indicator = rule.indicator;
              ruleTmp.type = rule.type;
              ruleTmp.direction = rule.direction;
              ruleTmp.crossDirection = rule.crossDirection;
              ruleTmp.period = p;
              ruleTmp.period2 = p2;
              ruleTmp.period3 = p3;
              rulesTmp.push(ruleTmp);
            }
          }
        } else {
          let ruleTmp = {};
          ruleTmp.indicator = rule.indicator;
          ruleTmp.type = rule.type;
          ruleTmp.direction = rule.direction;
          ruleTmp.crossDirection = rule.crossDirection;
          ruleTmp.period = p;
          ruleTmp.period2 = p2;
          rulesTmp.push(ruleTmp);
        }
      }
    }
  }

  return rulesTmp;
}

function getFullRulesVariations(rule, rulesCount, changeStoploss) {
  let rulesTmp = [];

  let maStepP = [10, 20, 30];
  let maStepV = [1, 3];
  let cmaStepP2 = [20, 30, 40];
  let cmaStepP = [5, 10];
  let rsiStepP = [7, 10, 14];
  let rsiStepV = [30, 70];
  let macdStepP2 = [12, 26];
  let macdStepP = [6, 12];
  let macdStepP3 = [5, 9];
  let macdStepV = [1];
  if (changeStoploss) {
    switch (rulesCount) {
      case 1:
        maStepP = [
          5,
          8,
          10,
          12,
          15,
          18,
          20,
          25,
          30,
          35,
          40,
          50
        ];
        maStepV = [
          0.2,
          0.3,
          0.5,
          0.8,
          1,
          1.5,
          2,
          2.5,
          3,
          4,
          5,
          6,
          7,
          8
        ];
        cmaStepP2 = [
          5,
          8,
          10,
          12,
          15,
          18,
          20,
          25,
          30,
          35,
          40,
          45,
          50
        ];
        cmaStepP = [
          3,
          5,
          8,
          10,
          12,
          15,
          18,
          20,
          25,
          30,
          35,
          40
        ];
        rsiStepP = [
          3,
          5,
          7,
          10,
          12,
          14,
          16,
          18,
          22
        ];
        rsiStepV = [
          10,
          15,
          20,
          25,
          30,
          35,
          40,
          50,
          60,
          65,
          70,
          75,
          80,
          85,
          90
        ];
        macdStepP2 = [
          6,
          12,
          18,
          22,
          26,
          32
        ];
        macdStepP = [
          3,
          6,
          12,
          14,
          18,
          22
        ];
        macdStepP3 = [3, 5, 9, 12];
        macdStepV = [0.5, 1, 2, 5];
        break;
      case 2:
        maStepP = [
          5,
          8,
          10,
          15,
          20,
          30,
          40
        ];
        maStepV = [
          0.2,
          0.5,
          1,
          2,
          5,
          8
        ];
        cmaStepP2 = [
          5,
          8,
          10,
          12,
          15,
          20,
          30,
          40,
          50
        ];
        cmaStepP = [
          3,
          5,
          8,
          10,
          12,
          15,
          20,
          30
        ];
        rsiStepP = [5, 7, 10, 14, 18];
        rsiStepV = [
          15,
          20,
          30,
          40,
          60,
          70,
          80,
          85
        ];
        macdStepP2 = [12, 22, 26, 32];
        macdStepP = [6, 12, 18];
        macdStepP3 = [5, 9];
        macdStepV = [0.5, 3];
        break;
      case 3:
        maStepP = [5, 10, 20, 30];
        maStepV = [0.2, 1, 2, 3, 5];
        cmaStepP2 = [
          5,
          10,
          20,
          30,
          40,
          50
        ];
        cmaStepP = [3, 5, 10, 15, 20];
        rsiStepP = [7, 10, 14, 18];
        rsiStepV = [15, 30, 50, 70, 85];
        macdStepP2 = [12, 22, 26, 32];
        macdStepP = [6, 12, 18];
        macdStepP3 = [5, 9];
        macdStepV = [1];
        break;
      case 4:
        maStepP = [10, 20, 30];
        maStepV = [0.2, 1, 3];
        cmaStepP2 = [10, 20, 30, 40];
        cmaStepP = [5, 10, 20];
        rsiStepP = [7, 10, 14];
        rsiStepV = [30, 50, 70];
        macdStepP2 = [12, 26, 32];
        macdStepP = [6, 12];
        macdStepP3 = [5, 9];
        macdStepV = [1];
        break;
      default:
    }
  } else {
    switch (rulesCount) {
      case 1:
      case 2:
        maStepP = [
          5,
          8,
          10,
          12,
          15,
          18,
          20,
          25,
          30,
          35,
          40,
          50
        ];
        maStepV = [
          0.2,
          0.3,
          0.5,
          0.8,
          1,
          1.5,
          2,
          2.5,
          3,
          4,
          5,
          6,
          7,
          8
        ];
        cmaStepP2 = [
          5,
          8,
          10,
          12,
          15,
          18,
          20,
          25,
          30,
          35,
          40,
          45,
          50
        ];
        cmaStepP = [
          3,
          5,
          8,
          10,
          12,
          15,
          18,
          20,
          25,
          30,
          35,
          40
        ];
        rsiStepP = [
          3,
          5,
          7,
          10,
          12,
          14,
          16,
          18,
          22
        ];
        rsiStepV = [
          10,
          15,
          20,
          25,
          30,
          35,
          40,
          50,
          60,
          65,
          70,
          75,
          80,
          85,
          90
        ];
        macdStepP2 = [
          6,
          12,
          18,
          22,
          26,
          32
        ];
        macdStepP = [
          3,
          6,
          12,
          14,
          18,
          22
        ];
        macdStepP3 = [3, 5, 9, 12];
        macdStepV = [0.5, 1, 2, 5];
        break;
      case 3:
        maStepP = [
          5,
          8,
          10,
          15,
          20,
          30,
          40
        ];
        maStepV = [
          0.2,
          0.5,
          1,
          2,
          5,
          8
        ];
        cmaStepP2 = [
          5,
          8,
          10,
          12,
          15,
          20,
          30,
          40,
          50
        ];
        cmaStepP = [
          3,
          5,
          8,
          10,
          12,
          15,
          20,
          30
        ];
        rsiStepP = [5, 7, 10, 14, 18];
        rsiStepV = [
          15,
          20,
          30,
          40,
          60,
          70,
          80,
          85
        ];
        macdStepP2 = [12, 22, 26, 32];
        macdStepP = [6, 12, 18];
        macdStepP3 = [5, 9];
        macdStepV = [0.5, 3];
        break;
      case 4:
        maStepP = [5, 10, 20, 30];
        maStepV = [0.2, 1, 2, 3, 5];
        cmaStepP2 = [
          5,
          10,
          20,
          30,
          40,
          50
        ];
        cmaStepP = [3, 5, 10, 15, 20];
        rsiStepP = [7, 10, 14, 18];
        rsiStepV = [15, 30, 50, 70, 85];
        macdStepP2 = [12, 22, 26, 32];
        macdStepP = [6, 12, 18];
        macdStepP3 = [5, 9];
        macdStepV = [1];
        break;
      case 5:
        maStepP = [10, 20, 30];
        maStepV = [0.2, 1, 3];
        cmaStepP2 = [10, 20, 30, 40];
        cmaStepP = [5, 10, 20];
        rsiStepP = [7, 10, 14];
        rsiStepV = [30, 50, 70];
        macdStepP2 = [12, 26, 32];
        macdStepP = [6, 12];
        macdStepP3 = [5, 9];
        macdStepV = [1];
        break;
      default:
    }
  }

  if (rule.indicator === 'sma' || rule.indicator === 'ema') {
    for (let p of maStepP) {
      if (rule.direction !== 'crossing') {
        for (let v of maStepV) {
          let ruleTmp = {};
          ruleTmp.indicator = rule.indicator;
          ruleTmp.direction = rule.direction;
          ruleTmp.crossDirection = rule.crossDirection;
          ruleTmp.period = p;
          ruleTmp.value = v;
          rulesTmp.push(ruleTmp);
        }
      } else {
        let ruleTmp = {};
        ruleTmp.indicator = rule.indicator;
        ruleTmp.direction = rule.direction;
        ruleTmp.crossDirection = rule.crossDirection;
        ruleTmp.period = p;
        rulesTmp.push(ruleTmp);
      }
    }
  } else if (rule.indicator === "cma") {
    for (let p2 of cmaStepP2) {
      for (let p of cmaStepP) {
        if (p >= p2) {
          break;
        }
        let ruleTmp = {};
        ruleTmp.indicator = rule.indicator;
        ruleTmp.type = rule.type;
        ruleTmp.type2 = rule.type2;
        ruleTmp.crossDirection = rule.crossDirection;
        ruleTmp.period = p;
        ruleTmp.period2 = p2;
        rulesTmp.push(ruleTmp);

      }
    }
  } else if (rule.indicator === "rsi") {

    for (let p of rsiStepP) {
      for (let v of rsiStepV) {
        let ruleTmp = {};
        ruleTmp.indicator = rule.indicator;
        ruleTmp.direction = rule.direction;
        ruleTmp.crossDirection = rule.crossDirection;
        ruleTmp.period = p;
        ruleTmp.value = v;
        rulesTmp.push(ruleTmp);
      }
    }
  } else if (rule.indicator === "macd") {
    for (let p2 of macdStepP2) {
      for (let p of macdStepP) {
        if (p >= p2) {
          break;
        }
        if (rule.type === 'signal line') {
          for (let p3 of macdStepP3) {
            if (rule.direction !== 'crossing') {
              for (let v of macdStepV) {
                let ruleTmp = {};
                ruleTmp.indicator = rule.indicator;
                ruleTmp.type = rule.type;
                ruleTmp.direction = rule.direction;
                ruleTmp.crossDirection = rule.crossDirection;
                ruleTmp.period = p;
                ruleTmp.period2 = p2;
                ruleTmp.period3 = p3;
                ruleTmp.value = v;
                rulesTmp.push(ruleTmp);
              }
            } else {
              let ruleTmp = {};
              ruleTmp.indicator = rule.indicator;
              ruleTmp.type = rule.type;
              ruleTmp.direction = rule.direction;
              ruleTmp.crossDirection = rule.crossDirection;
              ruleTmp.period = p;
              ruleTmp.period2 = p2;
              ruleTmp.period3 = p3;
              rulesTmp.push(ruleTmp);
            }
          }
        } else {
          let ruleTmp = {};
          ruleTmp.indicator = rule.indicator;
          ruleTmp.type = rule.type;
          ruleTmp.direction = rule.direction;
          ruleTmp.crossDirection = rule.crossDirection;
          ruleTmp.period = p;
          ruleTmp.period2 = p2;
          rulesTmp.push(ruleTmp);
        }
      }
    }
  }

  return rulesTmp;
}
async function getFineTuneStoplossAndTargetVariations(strategyVariations, strategy, rulesCount) {
  let newStrategyVariations = [];

  let sl = strategy.stoploss;
  let tt = strategy.target;
  let stops = [
    sl - 1,
    sl,
    sl + 1
  ];
  let targets = [
    sl - 1,
    sl,
    sl + 1
  ];
  switch (rulesCount) {
    case 1:
      stops = [
        sl - 1.5,
        sl - 1,
        sl - 0.5,
        sl,
        sl + 0.5,
        sl + 1,
        sl + 1.5
      ];
      targets = [
        tt - 1.5,
        tt - 1,
        tt - 0.5,
        tt,
        tt + 0.5,
        tt + 1,
        tt + 1.5
      ];
      break;
    case 2:
      stops = [
        sl - 1,
        sl - 0.5,
        sl,
        sl - 0.5,
        sl + 1
      ];
      targets = [
        tt - 1,
        tt - 0.5,
        tt,
        tt + 0.5,
        tt + 1
      ];
      break;
    default:
  }

  let count = 0;
  if (strategy.stoploss === null) {
    if (strategy.target === null) {
      return strategyVariations;
    } else {
      for (let target of targets) {
        if (target < 0.5) {
          continue;
        }
        for (let strategy of strategyVariations) {
          if (count > 1000 && count % 1000 === 0) {
            await sleep(0);
          }
          count++;
          let newSstrategy = {};
          newSstrategy.name = strategy.name;
          newSstrategy.buyRules = [];
          newSstrategy.sellRules = [];
          for (let buyRule of strategy.buyRules) {
            newSstrategy.buyRules.push(buyRule);
          }
          for (let sellRule of strategy.sellRules) {
            newSstrategy.sellRules.push(sellRule);
          }
          newSstrategy.stoploss = strategy.stoploss;
          newSstrategy.target = target;
          newStrategyVariations.push(newSstrategy)
        }
      }
    }
  } else {
    count = 0;
    for (let stoploss of stops) {
      if (target < 0.5) {
        continue;
      }
      if (strategy.target === null) {
        for (let strategy of strategyVariations) {
          if (count > 1000 && count % 1000 === 0) {
            await sleep(0);
          }
          count++;
          let newSstrategy = {};
          newSstrategy.name = strategy.name;
          newSstrategy.buyRules = [];
          newSstrategy.sellRules = [];
          for (let buyRule of strategy.buyRules) {
            newSstrategy.buyRules.push(buyRule);
          }
          for (let sellRule of strategy.sellRules) {
            newSstrategy.sellRules.push(sellRule);
          }
          newSstrategy.stoploss = stoploss;
          newSstrategy.target = strategy.target;
          newStrategyVariations.push(newSstrategy)
        }
      } else {
        for (let target of targets) {
          if (target < 0.5) {
            continue;
          }
          for (let strategy of strategyVariations) {
            if (count > 1000 && count % 1000 === 0) {
              await sleep(0);
            }
            count++;
            let newSstrategy = {};
            newSstrategy.name = strategy.name;
            newSstrategy.buyRules = [];
            newSstrategy.sellRules = [];
            for (let buyRule of strategy.buyRules) {
              newSstrategy.buyRules.push(buyRule);
            }
            for (let sellRule of strategy.sellRules) {
              newSstrategy.sellRules.push(sellRule);
            }
            newSstrategy.stoploss = stoploss;
            newSstrategy.target = target;
            newStrategyVariations.push(newSstrategy)
          }
        }
      }
    }
  }
  return newStrategyVariations;
}

async function getFullStoplossAndTargetVariations(strategyVariations, rulesCount) {
  let newStrategyVariations = [];
  stops = [1, 3, 5];
  targets = [1, 3, 7];
  switch (rulesCount) {
    case 1:
      stops = [1, 2, 3, 5];
      targets = [
        0.5,
        1,
        2,
        3,
        5,
        7,
        10
      ];
      break;
    case 2:
      stops = [1, 3, 5];
      targets = [1, 3, 5, 7, 10];
      break;
    case 3:
    case 4:
      stops = [1, 3, 5];
      targets = [1, 3, 5, 7];
      break;
    default:
  }

  let count = 0;
  for (let stoploss of stops) {
    for (let target of targets) {
      if (stoploss - 2 >= target) {
        continue;
      }
      for (let strategy of strategyVariations) {
        if (count > 1000 && count % 1000 === 0) {
          await sleep(0);
        }
        count++;
        let newSstrategy = {};
        newSstrategy.name = strategy.name;
        newSstrategy.buyRules = [];
        newSstrategy.sellRules = [];
        for (let buyRule of strategy.buyRules) {
          newSstrategy.buyRules.push(buyRule);
        }
        for (let sellRule of strategy.sellRules) {
          newSstrategy.sellRules.push(sellRule);
        }
        newSstrategy.stoploss = stoploss;
        newSstrategy.target = target;
        newStrategyVariations.push(newSstrategy)
      }
    }
  }
  return newStrategyVariations;
}

async function getNewStrategyVariations(newRules, strategyVariations, type, strategy, instrument, timeframe) {
  let newStrategyVariations = [];
  let count = 0;
  for (let newRule of newRules) {
    if (strategyVariations.length !== 0) {
      for (let strategyTmp of strategyVariations) {
        if (count > 1000 && count % 1000 === 0) {
          await sleep(0);
        }
        count++;
        let newSstrategy = {};
        newSstrategy.name = strategy.name + ' (' + instrument + ' ' + timeframe + ')';
        newSstrategy.buyRules = [];
        newSstrategy.sellRules = [];
        newSstrategy.stoploss = strategy.stoploss;
        newSstrategy.target = strategy.target;

        for (let buyRuleTmp of strategyTmp.buyRules) {
          newSstrategy.buyRules.push(buyRuleTmp);
        }
        for (let sellRuleTmp of strategyTmp.sellRules) {
          newSstrategy.sellRules.push(sellRuleTmp);
        }
        if (type === 'buy') {
          newSstrategy.buyRules.push(newRule);
        } else {
          newSstrategy.sellRules.push(newRule);
        }
        newStrategyVariations.push(newSstrategy);
      }
    } else {
      let newSstrategy = {};
      newSstrategy.name = strategy.name + ' (optimized for ' + instrument + ' ' + timeframe + ')';
      newSstrategy.buyRules = [];
      newSstrategy.sellRules = [];
      newSstrategy.stoploss = strategy.stoploss;
      newSstrategy.target = strategy.target;
      if (type === 'buy') {
        newSstrategy.buyRules.push(newRule);
      } else {
        newSstrategy.sellRules.push(newRule);
      }
      newStrategyVariations.push(newSstrategy);
    }
  }
  return newStrategyVariations;
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
  } catch (err) {}
}

async function opCancel() {
  $('#opCancelBtn').addClass('disabled');
  await terminateOpWorkers();
  $('#opResultDiv').hide();
  $('#opExecInfo').show();
}

function openOpStrategy(index) {
  openStrategyVariationStrategy(strategyVariationsResults[index].strategy)
}

function opOptInfo() {
  openModalInfoBig('<div class="text-center">Optimization Type</div>Rough Tune - uses a default wide range of parameters, ignoring yours.<br>Fine Tune - uses detailed variations around your parameters.<br>For more details please visit <span class="one-click-select">https://easycryptobot.com/optimization</span>');
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

  } catch (err) {}
}

function checkTooManyVariations() {
  let maxStrategyVariations = 250000;
  if (strategyVariations.length > maxStrategyVariations) {
    openModalInfoBig('Your strategy is too complicated and the possible variations exceed the maximum allowed number of 250 000.<br>Try to remove some rules from your strategy.');
    $('#runOptBtn').removeClass('disabled');
    $('#opResultDiv').hide();
    $('#opExecInfo').show();
    $('#opCancelBtn').removeClass('disabled');
    return true;
  }
  return false;
}
