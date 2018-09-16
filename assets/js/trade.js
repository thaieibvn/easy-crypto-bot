//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
let exchangesApiKeys = {};

function tsExecTypeChange() {
  if ($('#trExecTypeSignals').is(':checked')) {
    $('#tsPosSizeDiv').hide();
    $('#tsMaxLossDiv').hide();
  } else if ($('#trExecTypeSim').is(':checked')) {
    $('#tsPosSizeDiv').show();
    $('#tsMaxLossDiv').show();
  } else if ($('#trExecTypeTrade').is(':checked')) {
    $('#tsPosSizeDiv').show();
    $('#tsMaxLossDiv').show();
    let exchange = $('#tsExchangeCombobox').text();
    if (exchange !== 'Choose Exchange') {
      checkApiKey(exchange);
    }
  }
}

async function verifyKeyAndSecret(exchange) {
  let key = $('#exchangeApiKey').val();
  let secret = $('#exchangeApiSecret').val();
  if (key.length > 0 && secret.length > 0) {
    let apiKeyOk = await checkBinanceApiKey(key, secret);
    if (!apiKeyOk) {
      openModalInfo('Invalid API Key or Secret!');
      $('#tsExchangeCombobox').html('Choose Exchange');
      return;
    }
    exchangesApiKeys[exchange] = {
      key: key,
      secret: secret
    };
  } else {
    openModalInfo('Invalid API Key or Secret!');
    $('#tsExchangeCombobox').html('Choose Exchange');
  }
}

function checkApiKey(exchange) {
  if (exchangesApiKeys[exchange] === undefined) {
    openModalConfirm('<div class="text-justify">Please provide your API key for ' + exchange + '. If you don\'t have a key you can create one under "My Account" page on the ' + exchange + ' website.</div><br><div class="text-left"><span class="inline-block min-width5">API Key:&nbsp;</span><input class="min-width20" id="exchangeApiKey" type="text" placeholder="API KEY" /><br>' + '<span class="inline-block min-width5">Secret:&nbsp;</span><input class="min-width20" id="exchangeApiSecret" type="text" placeholder="Secret" /></div><br><div class="text-justify">Your key and secret are not stored anywhere by this application.</div>', function() {
      verifyKeyAndSecret(exchange);
    }, function() {
      $('#tsExchangeCombobox').html('Choose Exchange');
    });
  } else {
    //alert(exchangesApiKeys[exchange].key + ' ' + exchangesApiKeys[exchange].secret)
  }
}
async function tsFillBinanceInstruments() {
  if ($('#trExecTypeTrade').is(':checked')) {
    checkApiKey('Binance');
  }
  await getBinanceInstruments();
}

async function tsInstrumentKeyup() {
  try {
    fillPosSizeDetails();
    fillMaxLossDetails();
    let search = $('#tsInstrumentSearch').val().toLowerCase();
    $('#tsInstrumentList>ul').html('');
    let instruments = null;
    if ($('#tsExchangeCombobox').text() === 'Binance') {
      instruments = await getBinanceInstruments();
    } else {
      $('#tsInstrumentSearch').val('');
      openModalInfo('Please Choose Exchange First!');
      return;
    }

    let lastKey = null;

    if (instruments !== null) {
      let instrumentsToAdd = '';
      Object.keys(instruments).forEach(function(key) {
        if (key.toLowerCase().indexOf(search) != -1) {
          lastKey = key.toLowerCase();
          instrumentsToAdd += '<li><a href="#/"  onclick="tsFillInstrument(\'' + key + '\')">' + key + '</a></li>';
        }
      });
      if (lastKey !== null && lastKey !== search) {
        $('#tsInstrumentList>ul').html(instrumentsToAdd);
        $('#tsInstrument>div>ul').show()
      }

    }
  } catch (err) {}
}

function getBaseCurrency(pair) {
  if (pair.toLowerCase().endsWith("btc")) {
    return "BTC";
  } else if (pair.toLowerCase().endsWith("eth")) {
    return "ETH";
  } else if (pair.toLowerCase().endsWith("bnb")) {
    return "BNB";
  } else if (pair.toLowerCase().endsWith("usdt")) {
    return "USDT";
  } else {
    return '';
  }
}

function getQuotedCurrency(pair) {
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

async function tsFillInstrument(name) {
  $('#tsInstrument>div>ul').hide();
  $('#tsInstrumentSearch').val(name);
  fillPosSizeDetails();
  fillMaxLossDetails();
}

async function fillPosSizeDetails() {
  let instrument = $('#tsInstrumentSearch').val().toUpperCase();
  if (instrument.length <= 0 || getBaseCurrency(instrument) === '' || getQuotedCurrency(instrument) === '') {
    $('#tsQuotedCurrency').html('');
    return;
  }
  $('#tsQuotedCurrency').html(getQuotedCurrency(instrument));

  let value = $('#tsPosSize').val();
  if (value.length > 0 && Number.parseFloat(value) > 0) {
    let ustdValue = await getBinanceUSDTValue(Number.parseFloat(value), instrument, getBaseCurrency(instrument));
    if (!isNaN(ustdValue) && $('#tsPosSize').val() == value) {
      $('#tsQuotedCurrency').html(getQuotedCurrency(instrument) + ' ($' + ustdValue.toFixed(2) + ')');
    }
  }
}

async function fillMaxLossDetails() {
  let instrument = $('#tsInstrumentSearch').val().toUpperCase();
  if (instrument.length <= 0 || getBaseCurrency(instrument) === '' || getQuotedCurrency(instrument) === '') {
    $('#tsMaxLossCurrency').html('');
    return;
  }
  $('#tsMaxLossCurrency').html(getQuotedCurrency(instrument));

  let value = $('#tsMaxLoss').val();
  if (value.length > 0 && Number.parseFloat(value) > 0) {
    let ustdValue = await getBinanceUSDTValue(Number.parseFloat(value), instrument, getBaseCurrency(instrument));
    if (!isNaN(ustdValue) && $('#tsMaxLoss').val() == value) {
      $('#tsMaxLossCurrency').html(getQuotedCurrency(instrument) + ' ($' + ustdValue.toFixed(2) + ')');
    }
  }
}

let executedStrategies = [];
let executionWorkers = {};

const executionMutex = new Mutex();
const maxExecutions = 10;
function hasTradingStrategies() {
  let has = false;
  for (let execution of executedStrategies) {
    if (execution.status === 'running') {
      has = true;
      break;
    }
  }
  return has;
}
async function executeStrategy() {
  try {
    await executionMutex.lock();
    let runningExecutions = 0;
    for (let execution of executedStrategies) {
      if (execution.status !== 'removed') {
        runningExecutions++;
      }
    }
    if (runningExecutions >= maxExecutions) {
      openModalInfo('The maximum executions number is ' + maxExecutions + '. Please remove an execution before starting new one!');
      return;
    }

    $('#executeStrategyBtn').addClass('disabled');
    let strategyName = $('#tsStrategyCombobox').text();
    let exchange = $('#tsExchangeCombobox').text();
    let instrument = $('#tsInstrumentSearch').val().toUpperCase();
    let timeframe = $('#tsTimeframeCombobox').text();
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

    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy!');
      $('#tsStrategyCombobox').html('Choose Strategy');
      return;
    }

    let positionSize = '';
    let maxLoss = null;
    let executionType = 'Alerts';
    if ($('#trExecTypeTrade').is(':checked')) {
      executionType = 'Trading';
    } else if ($('#trExecTypeSim').is(':checked')) {
      executionType = 'Simulation';
    }

    if ($('#trExecTypeTrade').is(':checked') || $('#trExecTypeSim').is(':checked')) {
      positionSize = Number.parseFloat($('#tsPosSize').val());
      if (isNaN(positionSize) || positionSize <= 0) {
        openModalInfo('Position Size cannot be less than 0 !');
        return;
      }
      let lotSizeInfo = null;
      if (exchange === 'Binance') {
        lotSizeInfo = await getBinanceLotSizeInfo(instrument);
      }
      if (lotSizeInfo === null || lotSizeInfo[0] === null) {
        openModalInfo('Cannot obtain information for ' + instrument + ' from ' + exchange + ' exchange. Plase try later!');
        return;
      } else if (positionSize < lotSizeInfo[0]) {
        openModalInfo('Position Size for ' + instrument + ' cannot be less than ' + lotSizeInfo[0] + ' on ' + exchange + ' exchange!');
        return;
      } else if (positionSize > lotSizeInfo[1]) {
        openModalInfo('Position Size for ' + instrument + ' cannot be more than ' + lotSizeInfo[1] + ' on ' + exchange + ' exchange!');
        return;
      } else if (Math.round(Math.round(positionSize * 10000000) % Math.round(lotSizeInfo[2] * 10000000)) / 10000000 !== 0) {
        openModalInfo('Position Size for ' + instrument + ' must be a multiple of ' + lotSizeInfo[2] + ' on ' + exchange + ' exchange! ');
        return;
      }
      let maxLossTmp = Number.parseFloat($('#tsMaxLoss').val());
      if (!isNaN(maxLossTmp) && maxLossTmp !== 0) {
        maxLoss = (-1) * Math.abs(maxLossTmp);
      }
    }

    $('#tsResultDiv').show();

    let date = new Date();
    let strategyIndex = executedStrategies.length;
    let curExecution = {
      id: strategyIndex,
      type: executionType,
      name: strategyName,
      strategy: strategy,
      exchange: exchange,
      instrument: instrument,
      timeframe: getTimeframe(timeframe),
      positionSize: positionSize,
      status: 'starting',
      maxLoss: maxLoss,
      trades: []
    }
    executedStrategies.push(curExecution);
    $('#tsStrategiesTable').append('<tr id="executionTableItem' + strategyIndex + '"><td>' + executionType + '</td><td>' + strategyName + '</td><td>' + exchange + '</td><td>' + instrument + '</td><td>' + curExecution.timeframe + '</td><td class="text-center" id="executedTrades' + strategyIndex + '">0</td>' + '<td><span id="executionRes' + strategyIndex + '"></span>&nbsp;' + '<a title="Detailed Results" href="#executionDetailsLabel" onclick="showExecutionResult(\'' + strategyIndex + '\')"><i class="far fa-file-alt"></i></a>&nbsp;</td>' + '<td id="terminateStrBtn' + strategyIndex + '">Starting..</td></tr>');

    runStrategy(strategyIndex);

  } catch (err) {
    openModalInfo('Internal Error Occurred!<br>' + err);
  } finally {
    $('#executeStrategyBtn').removeClass('disabled');
    executionMutex.release();
  }
}

function fillExecResInTable(trades, index) {
  let result = 0;
  for (let trade of trades) {
    result += trade.result;
  }
  $('#executionRes' + index).removeClass('text-green');
  $('#executionRes' + index).removeClass('text-red');
  $('#executionRes' + index).html(result.toFixed(2) + '%');
  $('#executionRes' + index).addClass(
    result >= 0
    ? 'text-green'
    : 'text-red');
}

function checkMaxLossReached(index) {
  let execution = executedStrategies[index];
  if (execution.maxLoss === null || executedStrategies[index].status !== 'running') {
    return;
  }

  let result = 0;
  for (let trade of execution.trades) {
    result += trade.result;
  }
  let totalGainLoss = execution.positionSize * (result / 100);
  if (totalGainLoss <= execution.maxLoss) {
    stopStrategyExecution(index);
    openModalInfo('Execution of ' + execution.name + ' on ' + execution.exchange + ' for ' + execution.instrument + ' on ' + execution.timeframe + ' has reached the maximum loss.<br>The execution was stopped.');
  }
}

function runStrategy(index) {
  try {
    let execution = executedStrategies[index];
    let wk = null;
    if (execution.exchange === 'Binance') {
      wk = new Worker("./assets/js/binance-execution.js");
    }
    wk.addEventListener('error', function(e) {
      openModalInfo('Internal Error Occurred!<br>' + execution.type + ' ' + e.message + '<br>' + e.filename + ' ' + e.lineno);
    }, false);

    const runMutex = new Mutex();
    wk.addEventListener("message", async function(e) {
      try {
        await runMutex.lock();
        if (typeof e.data === 'string' && e.data.startsWith('ERR')) {
          openModalInfo('Internal Error Occurred!<br>' + e.data);
          return;
        }
        if (typeof e.data === 'string' && e.data.startsWith('started')) {
          execution.status = 'running';
          $('#terminateStrBtn' + index).html('Running&nbsp;<a class="stop-stgy-exec text-red" title="Stop Execution" href="#/" onclick="stopStrategyExecution(\'' + index + '\')"><i class="fas fa-pause"></i></a>');
          return;
        }
        if (typeof e.data === 'string' && e.data.startsWith('stopped')) {
          $('#executeStrategyBtn').removeClass('disabled');
          openModalInfo('Execution of strategy ' + execution.name + ' on exchang ' + execution.exchange + ' for instrument ' + execution.instrument + ' has failed to start!');
          $('#terminateStrBtn' + index).html('Failed&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(\'' + index + '\')"><i class="fas fa-times"></i></a>');
          executedStrategies[index].status = 'failed';
          return;
        }
        if (execution.type === 'Alerts') {
          let date = e.data[0];
          let price = e.data[1];
          let type = e.data[2];
          openModalInfo(type + ' Alert!<br><div class="text-left">Strategy: ' + execution.name + '<br>Exchange: ' + execution.exchange + '<br>Instrument: ' + execution.instrument + '<br>Date: ' + formatDateFull(date) + '<br>Entry Price: ' + price);
          execution.trades.push({type: type, date: date, entry: price});
          $('#executedTrades' + index).html(execution.trades.length);
        } else {
          let trade = e.data[0];
          let type = e.data[1];
          if (type === 'Buy') {
            execution.trades.push(trade);
            $('#executedTrades' + index).html(execution.trades.length);
          } else if (execution.trades.length > 0 && type === 'Sell') {
            let feeRate = e.data[2];
            execution.trades[execution.trades.length - 1]['closeDate'] = trade.closeDate;
            execution.trades[execution.trades.length - 1]['exit'] = trade.exit;
            execution.trades[execution.trades.length - 1]['result'] = (((trade.exit - execution.trades[execution.trades.length - 1].entry) / execution.trades[execution.trades.length - 1].entry) * 100) - feeRate;
            fillExecResInTable(execution.trades, index);
            checkMaxLossReached(index);
          } else if (type === 'Error') {
            execution.trades.pop();
            $('#executedTrades' + index).html(execution.trades.length);
            openModalInfo(trade + '<br><br>The execution of the strategy is stopped!');
            stopStrategyExecution(index);
          } else if (type === 'UpdateOpenPrice') {
            let tradeIndex = e.data[2];
            let feeRate = e.data[3];
            execution.trades[tradeIndex].entry = trade;
            if (execution.trades[tradeIndex].exit !== undefined && execution.trades[tradeIndex].exit !== null) {
              execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - feeRate;
              fillExecResInTable(execution.trades, index);
              checkMaxLossReached(index);
            }
          } else if (type === 'UpdateClosePrice') {
            let tradeIndex = e.data[2];
            let feeRate = e.data[3];
            $('#executionFeeRate').html(feeRate / 2);
            execution.trades[tradeIndex].exit = trade;
            execution.trades[tradeIndex].result = (((trade - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - feeRate;
            fillExecResInTable(execution.trades, index);
            checkMaxLossReached(index);
          }
        }
      } catch (err) {
        openModalInfo('Internal Error Occurred!<br>' + err);
      } finally {
        runMutex.release();
      }
    }, false);

    let apiKey = 'api-key';
    let apiSecret = 'api-secret';
    if (execution.type === 'Trading') {
      apiKey = exchangesApiKeys[execution.exchange].key;
      apiSecret = exchangesApiKeys[execution.exchange].secret;
    }
    if (executionWorkers[execution.id] !== undefined) {
      executionWorkers[execution.id].terminate();
      executionWorkers[execution.id] = undefined;
    }

    executionWorkers[execution.id] = wk;
    wk.postMessage([execution, apiKey, apiSecret]);
  } catch (err) {
    openModalInfo('Internal Error Occurred!<br>' + err);
  }
}

function rmExecutionFromTable(index) {
  openModalConfirm("Remove " + executedStrategies[index].name + " execution?", function() {
    if (executionWorkers[index] !== undefined) {
      executionWorkers[index].terminate();
      executionWorkers[index] = undefined;
      executedStrategies[index].status = 'removed';
    }
    $('#executionTableItem' + index).remove();
  });
}

function resumeExecution(index) {
  if (executionWorkers[index] !== undefined) {
    $('#terminateStrBtn' + index).html('Starting..');
    executedStrategies[index].status = 'starting';
    executionWorkers[index].postMessage('resume');
  } else {
    openModalInfo('Cannot resume the strategy. Please try later!');
  }
}

function stopStrategyExecution(index) {
  if (executionWorkers[index] !== undefined) {
    executionWorkers[index].postMessage('stop');
    $('#terminateStrBtn' + index).html('Stopped&nbsp;<a title="Resume Execution" href="#/" onclick="resumeExecution(\'' + index + '\')"><i class="fas fa-play"></i></a>&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(\'' + index + '\')"><i class="fas fa-times"></i></a>');
    executedStrategies[index].status = 'stopped';
  }
}

function showExecutionResult(index) {
  let execution = executedStrategies[index];
  $('#executionStrategiesTable').html('<thead><tr><td class="text-left">Trade</td><td>Open Date</td><td>Close Date</td><td>Open Price</td><td>Close Price</td><td>Result</td></tr></thead>');

  if (execution.type === 'Alerts') {
    $('#executionDetailsLabel').html('Alerts');
    $('.trade-section').hide();
    $('#executionDetailsLabel2').hide();
    $('#executionTableLabel').hide();
    $('#executionPosSizeResDiv').hide();
    $('#executionMaxLossResDiv').hide();
    $('#executionStrategiesTable').html('<thead><tr><td class="text-left">Direction</td><td>Date</td><td>Entry Price</td></tr></thead>');
    for (let trade of execution.trades) {
      let classColor = trade.type === 'Buy'
        ? 'text-green'
        : 'text-red';
      $('#executionStrategiesTable').append('<tr><td class="text-left ' + classColor + '">' + trade.type + '</td><td>' + formatDateFull(trade.date) + '</td><td>' + trade.entry.toFixed(8) + '</td></tr>');
    }

  } else {
    let totalReturn = 0;
    let winLossRatio = 0;
    let avgGainLossPerTrade = 0;
    let resultWithUSD = 0;
    let executedTrades = execution.trades.length;

    let winningPercent = 0;
    let winnignCount = 0;
    let avgWinPerTrade = 0;
    let biggestGain = 0;

    let loosingPercent = 0;
    let loosingCount = 0;
    let avgLostPerTrade = 0;
    let biggestLost = 0;

    let count = 1;
    for (let trade of execution.trades) {
      if (trade.closeDate !== undefined) {
        let classes = '';
        let resultClass = '';
        if (trade.result > 0) {
          if (biggestGain < trade.result) {
            biggestGain = trade.result;
          }
          winnignCount++;
          avgWinPerTrade += trade.result;
          classes = 'text-green fas fa-thumbs-up';
          resultClass = 'text-green';
        } else if (trade.result < 0) {
          if (biggestLost > trade.result) {
            biggestLost = trade.result;
          }
          loosingCount++;
          avgLostPerTrade += trade.result;
          classes = 'text-red fas fa-thumbs-down';
          resultClass = 'text-red';
        }
        totalReturn += trade.result;
        $('#executionStrategiesTable').append('<tr><td class="text-left">' + count + '&nbsp;<i class="' + classes + '"></td><td>' + formatDateFull(trade.openDate) + '</td><td>' + formatDateFull(trade.closeDate) + '</td><td>' + trade.entry.toFixed(8) + '</td><td>' + trade.exit.toFixed(8) + '</td><td class="' + resultClass + '">' + trade.result.toFixed(2) + '%</td></tr>');
      } else {
        $('#executionStrategiesTable').append('<tr><td class="text-left">' + count + '</td><td>' + formatDateFull(trade.openDate) + '</td><td></td><td>' + trade.entry.toFixed(8) + '</td><td></td><td ></td></tr>');
        executedTrades--;
      }
      count++;
    }
    if (executedTrades > 0) {
      avgGainLossPerTrade = totalReturn / executedTrades;
      winningPercent = (winnignCount / executedTrades) * 100;
      loosingPercent = (loosingCount / executedTrades) * 100;
      resultWithUSD = execution.positionSize * (totalReturn / 100);
    }
    if (loosingCount > 0) {
      winLossRatio = winnignCount / loosingCount;
    } else if (winnignCount > 0) {
      winLossRatio = 1;
    }
    if (winnignCount > 0) {
      avgWinPerTrade = avgWinPerTrade / winnignCount;
    }
    if (loosingCount > 0) {
      avgLostPerTrade = avgLostPerTrade / loosingCount;
    }

    $('#executionTotalReturn').html(totalReturn.toFixed(2) + '%');
    $('#executionWinLoss').html(winLossRatio.toFixed(2));
    $('#executionAvgWinLossPerTrade').html(avgGainLossPerTrade.toFixed(2) + '%');

    $('#executionResultWithUsd').html(resultWithUSD.toFixed(8) + '&nbsp;' + getQuotedCurrency(execution.instrument));
    $('#executionExecutedTrades').html(executedTrades);

    $('#executionWinningTradesP').html(winningPercent.toFixed(2) + '%');
    $('#executionWinningCount').html(winnignCount);
    $('#executionAvgGainPerWinning').html(avgWinPerTrade.toFixed(2) + '%');
    $('#executionBiggestGain').html(biggestGain.toFixed(2) + '%');

    $('#executionLoosingTradesP').html(loosingPercent.toFixed(2) + '%');
    $('#executionLoosingCount').html(loosingCount);
    $('#executionAvgLostPerWinning').html(avgLostPerTrade.toFixed(2) + '%');
    $('#executionBiggestLost').html(biggestLost.toFixed(2) + '%');

    $('#executionPosSizeResDiv').show();
    $('#executionPosSizeRes').html(execution.positionSize + ' ' + getQuotedCurrency(execution.instrument));
    if (execution.maxLoss !== null) {
      $('#executionMaxLossResDiv').show();
      $('#executionMasLossRes').html(Math.abs(execution.maxLoss) + ' ' + getQuotedCurrency(execution.instrument));
    } else {
      $('#executionMaxLossResDiv').hide();
    }
    fillUSDFields(resultWithUSD, execution.positionSize, execution.maxLoss, execution.instrument);

    $('#executionDetailsLabel').html(
      execution.type === 'Simulation'
      ? 'Execution Details (Simulation)'
      : 'Execution Details');
    $('#executionDetailsLabel2').show();
    $('.trade-section').show();
    $('#executionTableLabel').show();
  }
  $('#executionStrategyRes').html(execution.name);
  $('#executionExchangeRes').html(execution.exchange);
  $('#executionInstrumentRes').html(execution.instrument);
  $('#executionTimeframeRes').html(execution.timeframe);
  $('#tradeBody').css('opacity', '0.5');
  $('#tradeBody').css('pointer-events', 'none');
  $('#sidebar').css('opacity', '0.5');
  $('#sidebar').css('pointer-events', 'none');
  $('body').css('overflow', 'hidden');
  $('#executionResultsWindow').fadeIn();
}

async function fillUSDFields(resultWithUSD, posSize, maxLoss, instrument) {
  let ustdValue = await getBinanceUSDTValue(resultWithUSD, instrument, getBaseCurrency(instrument));
  $('#executionResultWithUsd').html(resultWithUSD.toFixed(8) + '&nbsp;' + getQuotedCurrency(instrument) + ' ( ~' + ustdValue.toFixed(2) + '$ )');

  let posSizeUsd = await getBinanceUSDTValue(posSize, instrument, getBaseCurrency(instrument));
  $('#executionPosSizeRes').html(execution.positionSize + '&nbsp;' + getQuotedCurrency(execution.instrument) + ' ( ~' + posSizeUsd.toFixed(2) + '$ )');
  if (maxLoss !== null) {
    let maxLossUsd = await getBinanceUSDTValue(resultWithUSD, instrument, getBaseCurrency(instrument));
    $('#executionMasLossRes').html(Math.abs(execution.maxLoss) + '&nbsp;' + getQuotedCurrency(execution.instrument) + ' ( ~' + maxLossUsd.toFixed(2) + '$ )');
  }
}

function closeExecutionWindow() {
  $('#tradeBody').css('opacity', '1');
  $('#tradeBody').css('pointer-events', 'auto');
  $('#sidebar').css('opacity', '1');
  $('#sidebar').css('pointer-events', 'auto');
  $('body').css('overflow', 'auto');
  $('#executionResultsWindow').hide();
}
