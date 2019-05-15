//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
let exchangesApiKeys = {};

function tsExecTypeChange() {
  if ($('#trExecTypeSignals').is(':checked')) {
    $('#tsPosSizeDiv').hide();
    $('#tsMaxLossDiv').hide();
    $('#feeRateDiv').hide();
    $('#emailDiv').show();
  } else if ($('#trExecTypeSim').is(':checked')) {
    $('#emailDiv').hide();
    $('#tsPosSizeDiv').show();
    $('#tsMaxLossDiv').show();
    $('#feeRateDiv').show();
  } else if ($('#trExecTypeTrade').is(':checked')) {
    $('#emailDiv').hide();
    $('#feeRateDiv').hide();
    $('#tsPosSizeDiv').show();
    $('#tsMaxLossDiv').show();
    let exchange = $('#tsExchangeCombobox').text();
    if (exchange !== 'Choose Exchange') {
      checkApiKey(exchange);
    }
  }
}

async function tsFillBinanceInstruments() {
  if ($('#trExecTypeTrade').is(':checked')) {
    checkApiKey('Binance');
  }
  await getBinanceInstruments();
}

let tsInstrumentMutex = new Mutex();
async function tsInstrumentKeyup() {
  try {
    tsInstrumentMutex.lock();
    fillPosSizeDetails();
    fillMaxLossDetails();
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
      let search = $('#tsInstrumentSearch').val().toLowerCase();
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
  } catch (err) {
    log('error', 'tsInstrumentKeyup', err.stack);
  } finally {
    await tsInstrumentMutex.release();
  }
}

async function tsFillInstrument(name) {
  $('#tsInstrument>div>ul').hide();
  $('#tsInstrumentSearch').val(name);
  fillPosSizeDetails();
  fillMaxLossDetails();
}

async function fillPosSizeDetails(field) {
  if (field === 'base') {
    $('#tsPosSize2').val('');
  } else if (field === 'quoted') {
    $('#tsPosSize').val('');
  }
  fillPosSizeDetailsImpl($('#tsInstrumentSearch').val().toUpperCase(), '#tsQuotedCurrency', '#tsPosSize', '#tsQuotedCurrency2', '#tsPosSize2',);
}

async function fillPosSizeDetailsEdit(field) {
  if (field === 'base') {
    $('#executionPosSizeEdit2').val('');
  } else if (field === 'quoted') {
    $('#executionPosSizeEdit').val('');
  }
  fillPosSizeDetailsImpl($('#executionInstrumentEdit').html().toUpperCase(), '#tsQuotedCurrencyEdit', '#executionPosSizeEdit', '#tsQuotedCurrencyEdit2', '#executionPosSizeEdit2');
}

async function fillPosSizeDetailsImpl(instrument, baseCurrencyId, posSizeId, quotedCurrencyId, posSizeId2) {
  if (instrument.length <= 0 || getQuotedCurrency(instrument) === '' || getBaseCurrency(instrument) === '') {
    $(baseCurrencyId).html('');
    $(quotedCurrencyId).html('');
    $(posSizeId).attr("placeholder", "Amount in Base Coin");
    $(posSizeId2).attr("placeholder", "Amount in Quoted Coin");
    return;
  }
  $(baseCurrencyId).html(getBaseCurrency(instrument));
  $(quotedCurrencyId).html(getQuotedCurrency(instrument));
  $(posSizeId).attr("placeholder", "Amount in " + getBaseCurrency(instrument));
  $(posSizeId2).attr("placeholder", "Amount in " + getQuotedCurrency(instrument));

  let prices = await getLastBinancePrices();
  let value = $(posSizeId).val();
  if (value.length > 0 && Number.parseFloat(value) > 0) {
    let ustdValue = calculateUsdtValue(getBaseCurrency(instrument), Number.parseFloat(value), prices);
    if (ustdValue != null && !isNaN(ustdValue) && $(posSizeId).val() == value) {
      $(baseCurrencyId).html(getBaseCurrency(instrument) + ' (~ $' + ustdValue.toFixed(2) + ' )');
    }
  }

  let value2 = $(posSizeId2).val();
  if (value2.length > 0 && Number.parseFloat(value2) > 0) {
    let ustdValue2 = calculateUsdtValue(getQuotedCurrency(instrument), Number.parseFloat(value2), prices);
    if (ustdValue2 != null && !isNaN(ustdValue2) && $(posSizeId2).val() == value2) {
      $(quotedCurrencyId).html(getQuotedCurrency(instrument) + ' (~ $' + ustdValue2.toFixed(2) + ' )');
    }
  }

}

async function fillMaxLossDetails() {
  fillMaxLossDetailsImpl($('#tsInstrumentSearch').val().toUpperCase(), '#tsMaxLossCurrency', '#tsMaxLoss');
}

async function fillMaxLossDetailsEdit() {
  fillMaxLossDetailsImpl($('#executionInstrumentEdit').html().toUpperCase(), '#tsMaxLossCurrencyEdit', '#executionMaxLossEdit');
}

async function fillMaxLossDetailsImpl(instrument, quotedCurrencyId, posSizeId) {
  if (instrument.length <= 0 || getQuotedCurrency(instrument) === '' || getBaseCurrency(instrument) === '') {
    $(quotedCurrencyId).html('');
    return;
  }
  $(quotedCurrencyId).html(getQuotedCurrency(instrument));

  let value = Math.abs(Number.parseFloat($(posSizeId).val()));
  if (!isNaN(value) && value != 0) {
    let prices = await getLastBinancePrices();
    let ustdValue = calculateUsdtValue(getQuotedCurrency(instrument), value, prices);
    if (ustdValue != null && !isNaN(ustdValue) && Math.abs(Number.parseFloat($(posSizeId).val())) == value) {
      $(quotedCurrencyId).html(getQuotedCurrency(instrument) + ' (~ $' + ustdValue.toFixed(2) + ' )');
    }
  }
}

function fillExecResInTable(trades, id) {
  let result = 0;
  for (let trade of trades) {
    result += trade.result;
  }
  $('#executionRes' + id).removeClass('text-green');
  $('#executionRes' + id).removeClass('text-red');
  $('#executionRes' + id).html(result.toFixed(2) + '%');
  $('#executionRes' + id).addClass(
    result > 0
    ? 'text-green'
    : result < 0
      ? 'text-red'
      : '');
}

async function checkMaxLossReached(id) {
  let execution = await getExecutionById(id);
  if (execution.maximumLoss === null || execution.maximumLoss === undefined) {
    return false;
  }

  let result = 0;
  for (let trade of execution.trades) {
    result += trade.resultMoney;
  }

  if (result <= execution.maximumLoss) {
    let errorMsg = 'Max Loss of ' + execution.maximumLoss + ' ' + getQuotedCurrency(execution.instrument) + ' was reached for execution ' + execution.name + ' on ' + execution.exchange + ' for ' + execution.instrument + '. If you want to continue the execution, you have to edit the Max Loss field.';
    await stopStrategyExecution(id, errorMsg);
    openModalInfoBig('<h3 class="text-center">Max Loss Reached!</h3>' + errorMsg + '<br>The execution was stopped.');
    execution.error = errorMsg;
    await updateExecutionDb(execution);
    if (execution.type === 'Trading') {
      sendErrorMail(execution);
    }
    return true;
  }
  return false;
}

function maxLossInfo() {
  openModalInfoBig('If the total result of all closed trades exeeds the defined Maximum Loss the execution of the strategy will stop automatically.<br>Please take in mind that this is not a single trade stoploss and only fully closed trades are used for the calculation. This means that if an open trade exeeds the Maximum loss the execution will not be stopped until the trade is closed and the total loss may exeeds the defined Max Loss value! You can define a single trade stoploss in your strategy.');
}
function stalledInfo() {
  openModalInfoBig('The execution has lost connection to Binance but is trying to restore it. You may lost connection to internet.');
}

function setStatusAndActions(id, status, errorMsg) {

  if (status === 'MaxLoss') {
    $('#statusStr' + id).html('<span class="text-red">MaxLoss&nbsp;<a title="Show Error" href="#/" onclick="showErrorMsg(\'' + errorMsg + '\', ' + id + ')"><i class="fas fa-question-circle"></i></a></span>');
    $('#actionsBtns' + id).html('<a title="Clear Error" href="#/" onclick="clearError(' + id + ')"><i class="fas fa-recycle"></i></a>&nbsp;&nbsp;<a title="Edit Execution" href="#/" onclick="editExecution(' + id + ')"><i class="far fa-edit"></i></a>&nbsp;&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-trash"></i></a>');
  } else if (status === 'Error') {
    $('#statusStr' + id).html('<span class="text-red">Error&nbsp;<a title="Show Error" href="#/" onclick="showErrorMsg(\'' + errorMsg + '\', ' + id + ')"><i class="fas fa-question-circle"></i></a></span>');
    $('#actionsBtns' + id).html('<a title="Clear Error" href="#/" onclick="clearError(' + id + ')"><i class="fas fa-recycle"></i></a>&nbsp;&nbsp;<a title="Edit Execution" href="#/" onclick="editExecution(' + id + ')"><i class="far fa-edit"></i></a>&nbsp;&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-trash"></i></a>');
  } else if (status === 'Stopped') {
    $('#statusStr' + id).html('Stopped');
    $('#actionsBtns' + id).html('<a class="text-green" title="Resume Execution" href="#/" onclick="runStrategy(' + id + ')"><i class="fas fa-play"></i></a>&nbsp;&nbsp;<a title="Edit Execution" href="#/" onclick="editExecution(' + id + ')"><i class="far fa-edit"></i></a>&nbsp;&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-trash"></i></a>');
  } else if (status === 'Running') {
    $('#statusStr' + id).html('Running');
    $('#actionsBtns' + id).html('<a class="stop-stgy-exec text-red" title="Stop Execution" href="#/" onclick="stopStrategyExecution(' + id + ')"><i class="fas fa-stop"></i></a>');
  } else if (status === 'Stalled') {
    $('#statusStr' + id).html('Stalled<a title="Info" onclick="stalledInfo()" href="#/">&nbsp;<i class="fa fa-info-circle"></i></a>');
    $('#actionsBtns' + id).html('<a class="stop-stgy-exec text-red" title="Stop Execution" href="#/" onclick="stopStrategyExecution(' + id + ')"><i class="fas fa-stop"></i></a>');
  } else {
    $('#statusStr' + id).html(status);
    $('#actionsBtns' + id).html('');
  }
}

function showErrorMsg(msg, id) {
  openModalInfoBig('<h3 class="text-red text-center">ERROR</h3><div class="text-red">' + msg + '</div><br><div class="text-center"><a class="button alt white" title="Clear Error" href="#/" onclick="clearError(' + id + ')">Clear Error</a></div>')
}

async function rmExecutionFromTable(id) {
  let execution = await getExecutionById(id);
  openModalConfirm("Remove " + execution.name + " execution?", async function() {
    for (let worker of executionWorkers) {
      if (worker.execId == id) {
        worker.wk.postMessage('TERMINATE');
        worker.status = 'free';
        break;
      }
    }
    $('#executionTableItem' + id).remove();
    await sleep(200);
    await removeExecutionFromDb(id);
    let executions = await getExecutionsFromDb();
    if (executions.length == 0) {
      $('#tsResultDiv').hide();
    }
  });
}

async function showExecutionResult(id) {
  try {
    let execution = await getExecutionById(id);
    $('#executionStrategiesTable').html('<thead><tr><td class="text-left">Trade</td><td>Open Date</td><td>Close Date</td><td>Open Price</td><td>Close Price</td><td>Trade Size (' + getBaseCurrency(execution.instrument) + ')</td><td>Result %</td><td>Result ' + getQuotedCurrency(execution.instrument) + '</td> </tr></thead>');
    if (execution.type === 'Alerts') {
      $('#executionDetailsLabel').html('Alerts');
      $('.trade-section').hide();
      $('#executionDetailsLabel2').hide();
      $('#executionTableLabel').hide();
      $('#executionPosSizeResDiv').hide();
      $('#executionPosSizeResDiv2').hide();
      $('#executionMaxLossResDiv').hide();
      $('#executionEmailResDiv').hide();
      if (execution.email !== null && execution.email !== undefined && execution.email.length > 0) {
        $('#executionEmailResDiv').show();
        $('#executionResEmail').html(execution.email);
      }
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
      let resultMoney = 0;
      let count = 1;
      if (execution.feeRate !== null && execution.feeRate !== undefined) {
        $('#executionFeeRate').html('Fee Rate per trade: ' + execution.feeRate.toFixed(4) + '%');
      } else {
        $('#executionFeeRate').html('');
      }
      for (let trade of execution.trades) {
        if (trade.closeDate !== undefined && trade.exit != null) {
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
          resultMoney += trade.resultMoney;

          $('#executionStrategiesTable').append('<tr><td class="text-left">' + count + '&nbsp;<i class="' + classes + '"></td><td>' + formatDateFull(trade.openDate) + '</td><td>' + formatDateFull(trade.closeDate) + '</td><td>' + trade.entry.toFixed(8) + '</td><td>' + trade.exit.toFixed(8) + '</td><td>' + trade.posSize.toFixed(8) + '</td><td class="' + resultClass + '">' + trade.result.toFixed(2) + '</td><td class="' + resultClass + '">' + trade.resultMoney.toFixed(8) + '</td></tr>');
        } else {
          $('#executionStrategiesTable').append('<tr><td class="text-left">' + count + '</td><td>' + formatDateFull(trade.openDate) + '</td><td></td><td>' + trade.entry.toFixed(8) + '</td><td></td><td>' + trade.posSize.toFixed(8) + '</td><td ></td><td ></td></tr>');
          executedTrades--;
        }
        count++;
      }
      if (executedTrades > 0) {
        avgGainLossPerTrade = totalReturn / executedTrades;
        winningPercent = (winnignCount / executedTrades) * 100;
        loosingPercent = (loosingCount / executedTrades) * 100;
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

      $('#executionResultWithUsd').html(resultMoney.toFixed(8) + '&nbsp;' + getQuotedCurrency(execution.instrument));
      $('#executionExecutedTrades').html(executedTrades);

      $('#executionWinningTradesP').html(winningPercent.toFixed(2) + '%');
      $('#executionWinningCount').html(winnignCount);
      $('#executionAvgGainPerWinning').html(avgWinPerTrade.toFixed(2) + '%');
      $('#executionBiggestGain').html(biggestGain.toFixed(2) + '%');

      $('#executionLoosingTradesP').html(loosingPercent.toFixed(2) + '%');
      $('#executionLoosingCount').html(loosingCount);
      $('#executionAvgLostPerWinning').html(avgLostPerTrade.toFixed(2) + '%');
      $('#executionBiggestLost').html(biggestLost.toFixed(2) + '%');

      $('#executionEmailResDiv').hide();

      if (execution.positionSize != undefined && execution.positionSize != null && execution.positionSize > 0) {
        $('#executionPosSizeResDiv').show();
        $('#executionPosSizeResDiv2').hide();
        $('#executionPosSizeRes').html(execution.positionSize + ' ' + getBaseCurrency(execution.instrument));
      } else {
        $('#executionPosSizeResDiv').hide();
        $('#executionPosSizeResDiv2').show();
        $('#executionPosSizeRes2').html(execution.positionSizeQuoted + ' ' + getQuotedCurrency(execution.instrument));
      }
      if (execution.maximumLoss != null && execution.maximumLoss != undefined) {
        $('#executionMaxLossResDiv').show();
        $('#executionMasLossRes').html(Math.abs(execution.maximumLoss).toFixed(8) + ' ' + getQuotedCurrency(execution.instrument));
      } else {
        $('#executionMaxLossResDiv').hide();
      }
      fillUSDFields(resultMoney, execution.positionSize, execution.positionSizeQuoted, execution.maximumLoss, execution.instrument);

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
    openModals();
    $('body').css('overflow', 'hidden');
    $("#executionResultsWindowDiv").animate({
      scrollTop: 0
    }, 'fast');
    $('#executionResultsWindow').fadeIn();
  } catch (err) {
    log('error', 'showExecutionResult', err.stack);
  }
}

async function fillUSDFields(resultMoney, posSize, posSizeQuoted, maxLoss, instrument) {
  try {
    let prices = await getLastBinancePrices();
    let ustdValue = calculateUsdtValue(getQuotedCurrency(instrument), resultMoney, prices);
    if (ustdValue == null) {
      $('#executionResultWithUsd').html(resultMoney.toFixed(8) + '&nbsp;' + getQuotedCurrency(instrument));
      $('#executionPosSizeRes').html(posSize + '&nbsp;' + getBaseCurrency(instrument));
      $('#executionMasLossRes').html(Math.abs(maxLoss).toFixed(8) + '&nbsp;' + getQuotedCurrency(instrument));
      return;
    }

    $('#executionResultWithUsd').html(resultMoney.toFixed(8) + '&nbsp;' + getQuotedCurrency(instrument) + ' (~ $' + ustdValue.toFixed(2) + ' )');

    if (posSize != null && posSize != undefined && posSize > 0) {
      let posSizeUsd = calculateUsdtValue(getBaseCurrency(instrument), posSize, prices);
      $('#executionPosSizeRes').html(posSize + '&nbsp;' + getBaseCurrency(instrument) + ' (~ $' + posSizeUsd.toFixed(2) + ' )');
    } else {
      let posSizeUsd = calculateUsdtValue(getQuotedCurrency(instrument), posSizeQuoted, prices);
      $('#executionPosSizeRes2').html(posSizeQuoted + '&nbsp;' + getQuotedCurrency(instrument) + ' (~ $' + posSizeUsd.toFixed(2) + ' )');
    }
    if (maxLoss !== null) {
      let maxLossUsd = calculateUsdtValue(getQuotedCurrency(instrument), Math.abs(maxLoss), prices);
      $('#executionMasLossRes').html(Math.abs(maxLoss).toFixed(8) + '&nbsp;' + getQuotedCurrency(instrument) + ' (~ $' + maxLossUsd.toFixed(2) + ' )');
    }
  } catch (err) {
    log('error', 'fillUSDFields', err.stack);
  }
}

function closeExecutionWindow() {
  $('#wrapper').css('opacity', '1');
  $('#wrapper').css('pointer-events', 'auto');
  $('#sidebar').css('opacity', '1');
  $('#sidebar').css('pointer-events', 'auto');
  $('#footer').css('opacity', '1');
  $('#footer').css('pointer-events', 'auto');
  $('body').css('overflow', 'auto');
  $('#executionResultsWindow').hide();
}

function closeEditExecutionWindow() {
  $('#wrapper').css('opacity', '1');
  $('#wrapper').css('pointer-events', 'auto');
  $('#sidebar').css('opacity', '1');
  $('#sidebar').css('pointer-events', 'auto');
  $('#footer').css('opacity', '1');
  $('#footer').css('pointer-events', 'auto');
  $('body').css('overflow', 'auto');
  $('#editExecutionWindow').hide();
}

var executionsDb = null;
function getExecutionsDb() {
  if (executionsDb === null) {
    executionsDb = new Datastore({
      filename: getAppDataFolder() + '/db/executions.db',
      autoload: true
    });
    executionsDb.persistence.setAutocompactionInterval(1000 * 60 * 5); //Every 5 minutes
  }
  return executionsDb;
}

let executionFilled = false;
async function fillOldExecutions() {
  if (!executionFilled) {
    executionFilled = true;
    let executions = await getExecutionsFromDb();
    let isOldVersion = false;
    if (executions !== null && executions.length > 0) {
      for (let execution of executions) {
        //Check for old version strategies without individual rule timeframes
        let hasRuleWithNoTf = false;
        for (let rule of execution.strategy.buyRules) {
          if (rule.timeframe === null || rule.timeframe === undefined) {
            hasRuleWithNoTf = true;
            break;
          }
        }
        for (let rule of execution.strategy.sellRules) {
          if (rule.timeframe === null || rule.timeframe === undefined) {
            hasRuleWithNoTf = true;
            break;
          }
        }
        if (hasRuleWithNoTf) {
          execution.error = 'This strategy contains rules without individual timeframes. You will not be able to resume the execution. You can remove this execution, edit the strategy by adding timeframes to each rule and then execute it again.';
          isOldVersion = true;
        }

        //Check for old version execution (v1.0.26) without resultMoney fields
        for (let trade of execution.trades) {
          if ((trade.resultMoney == undefined || trade.resultMoney == undefined) && trade.exit != undefined && trade.exit != null) {
            trade.resultMoney = (trade.result / 100) * (execution.positionSize * trade.exit);
            isOldVersion = true;
          }
        }
        if (execution.maxLoss != null && execution.maxLoss != undefined && execution.maxLoss > 0) {
          let prices = await getLastBinancePrices();
          let curPrice = prices[execution.instrument];
          execution.maximumLoss = curPrice * execution.maxLoss;
          execution.maxLoss = null;
          delete execution.maxLoss;
          isOldVersion = true;
        }

        //Check for old version execution (v1.0.31) without posSize fields
        for (let trade of execution.trades) {
          if (trade.posSize == undefined || trade.posSize == null) {
            trade.posSize = execution.positionSize;
            isOldVersion = true;
          }
        }

        //Check for old version execution (v1.0.31) without minNotionalAmountLeft fields
        if (execution.minNotionalAmountLeft == undefined || execution.minNotionalAmountLeft == null) {
          execution.minNotionalAmountLeft = 0;
          isOldVersion = true;
        }

        if (isOldVersion) {
          await updateExecutionDb(execution);
        }

        let status = 'Stopped';
        if (execution.error !== null && execution.error !== undefined) {
          status = 'Error'
        }
        let openTrade = '';
        if (execution.trades.length > 0 && execution.trades[execution.trades.length - 1].exit === undefined) {
          openTrade = '<i class="fa fa-check"></i>';
        }
        if (execution.type === 'Alerts' && execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].type === 'Sell')) {
          openTrade = '';
        }
        $('#tsStrategiesTable').append('<tr id="executionTableItem' + execution.id + '"><td>' + execution.type + '</td><td id="executionName' + execution.id + '">' + execution.name + '</td><td>' + execution.exchange + '</td><td>' + execution.instrument + '</td><td class="text-center" id="posSizePercent' + execution.id + '"></td>' + '<td class="text-center" id="executedTrades' + execution.id + '">' + execution.trades.length + '</td><td class="text-center" id="openTrade' + execution.id + '">' + openTrade + '</td><td class="text-right"><span id="executionRes' + execution.id + '"></span></td><td><a title="Detailed Results" href="#executionDetailsLabel" onclick="showExecutionResult(' + execution.id + ')"><i class="far fa-file-alt"></i></a></td>' + '<td class="text-center" id="lastUpdatedExecution' + execution.id + '"></td><td id="statusStr' + execution.id + '"></td><td id="actionsBtns' + execution.id + '"></td></tr>');
        setStatusAndActions(execution.id, status, execution.error);
        if (execution.type !== 'Alerts') {
          fillExecResInTable(execution.trades, execution.id);
        }
      }
      $('#tsResultDiv').show();
    }
  }
}

function getExecutionsFromDb() {
  return new Promise((resolve, reject) => {
    getExecutionsDb().find({}).sort({date: 1}).exec((error, executions) => {
      if (error) {
        reject(error);
      } else {
        resolve(executions);
      }
    })
  });
}

const executionDbUpdateMutex = new Mutex();

async function getExecutionById(id) {
  try {
    await executionDbUpdateMutex.lock();
    if (typeof id === 'string') {
      id = Number(id);
    }
    return new Promise((resolve, reject) => {
      getExecutionsDb().findOne({
        id: id
      }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      })
    });
  } finally {
    await executionDbUpdateMutex.release();
  }
}

function addExecutionToDb(execution) {
  return new Promise((resolve, reject) => {
    getExecutionsDb().insert(execution, (error, srt) => {
      if (error) {
        reject(error);
      } else {
        resolve(srt);
      }
    })
  });
}

async function updateExecutionDb(execution) {
  try {
    await executionDbUpdateMutex.lock();
    await removeExecutionFromDb(execution.id);
    await addExecutionToDb(execution);
    //getExecutionsDb().persistence.compactDatafile();
  } finally {
    await executionDbUpdateMutex.release();
  }
}

function removeExecutionFromDb(id) {
  return new Promise((resolve, reject) => {
    getExecutionsDb().remove({
      id: id
    }, function(error, numDeleted) {
      if (error) {
        reject(error);
      } else {
        resolve(numDeleted);
      }
    })
  });
}

function sendEmail(execution, type, date, entry) {
  if (execution.email === null || execution.email === undefined) {
    return;
  }
  $.post("https://easycryptobot.com/mail-sender.php", {
    f: 'ecb',
    m: execution.email,
    s: execution.strategy.name,
    i: execution.instrument,
    d: formatDateFull(date),
    e: entry,
    t: type
  }, function(data, status) {});
}

var emailDb = null;
function getEmailDb() {
  if (emailDb === null) {
    emailDb = new Datastore({
      filename: getAppDataFolder() + '/db/email.db',
      autoload: true
    });
  }
  return emailDb;
}

function getEmailFromDb() {
  return new Promise((resolve, reject) => {
    getEmailDb().findOne({
      id: 'trade-mail'
    }, (error, result) => {
      if (error) {
        resolve(null);
      } else {
        if (result != null && result != undefined && result.email != null && result.email != undefined && result.email.length > 0 && result.email.indexOf('@') != -1) {
          resolve(result.email);
          return;
        }
        resolve(null);
      }
    })
  });
}

function removeEmailFromDb() {
  return new Promise((resolve, reject) => {
    getEmailDb().remove({
      id: 'trade-mail'
    }, function(error, numDeleted) {
      resolve(numDeleted);
    })
  });
}

function addEmailToDb(email) {
  return new Promise((resolve, reject) => {
    getEmailDb().insert({
      id: 'trade-mail',
      email: email
    }, (error, srt) => {
      if (error) {
        reject(error);
      } else {
        resolve(srt);
      }
    })
  });
}

async function updateEmailDb(email) {
  await removeEmailFromDb();
  await addEmailToDb(email);
}

let sendNotifications = false;
async function notifications() {
  if (!sendNotifications) {
    let email = await getEmailFromDb();
    if (email == null) {
      email = '';
    }
    openModalConfirm('<div class="text-justify">If you want to receive trading updates on your Real Trading strategies, please fill your email bellow:</div>' + '<input style="width:100%"class="search main-field white" id="emailBoxTmp" type="text" placeholder="E-mail to receive Notifications" value="' + email + '"/>', async function() {
      email = $('#emailBoxTmp').val();
      if (email.indexOf('@') === -1) {
        openModalInfo('Please type a valid email!');
        return;
      }
      await updateEmailDb(email);
      await fillEmailField();
      $('#notificationsBtn').html('<i class="text-red fas fa-stop"></i> Stop Notifications');
      sendNotifications = true;
    })
  } else {
    openModalInfo('Notifications are stopped!')
    $('#notificationsBtn').html('<i class="text-green fas fa-play"></i> Start Notifications');
    sendNotifications = false;
  }
}

async function editTrStrategy() {
  try {
    let strategyName = $('#tsStrategyCombobox').text();
    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy to Edit!');
      $('#tsStrategyCombobox').html('Choose Strategy');
      return;
    }
    editStrategy(strategyName);
  } catch (err) {
    log('error', 'editTrStrategy', err.stack);
  }
}

async function clearError(id) {
  let execution = await getExecutionById(id);
  if (execution.error !== null || execution.error !== undefined) {
    execution.error = null;
    await updateExecutionDb(execution);
    setStatusAndActions(id, 'Stopped');
  }
  $('#wrapper').css('opacity', '1');
  $('#wrapper').css('pointer-events', 'auto');
  $('#sidebar').css('opacity', '1');
  $('#sidebar').css('pointer-events', 'auto');
  $('#footer').css('opacity', '1');
  $('#footer').css('pointer-events', 'auto');
  $('#wrapperModals').css('opacity', '1');
  $('#wrapperModals').css('pointer-events', 'auto');
  $('#modalInfo').css('display', 'none');
}

async function clearErrors() {
  let executions = await getExecutionsFromDb();
  if (executions !== null && executions.length > 0) {
    for (let execution of executions) {
      if (execution.error !== null && execution.error !== undefined) {
        clearError(execution.id);
      }
    }
  }
}

async function editExecution(id) {
  let execution = await getExecutionById(id);
  $('#executionStrategyEdit').html(execution.strategy.name);
  $('#executionExchangeEdit').html(execution.exchange);
  $('#executionInstrumentEdit').html(execution.instrument);

  if (execution.type === 'Alerts') {
    $('#executionModeEdit').html('Alerts');
    $('#executionPosSizeEditDiv').hide();
    $('#executionMaxLosEditDiv').hide();
    $('#executionFeeRateEditDiv').hide();
    $('#executionOpenTradeEditDiv').hide();
    $('#executionMailEditDiv').show();
    if (execution.email !== null && execution.email !== undefined && execution.email.length > 0) {
      $('#executionEmailEdit').val(execution.email);
    } else {
      $('#executionEmailEdit').val('');
    }
  } else {
    $('#executionPosSizeEditDiv').show();
    $('#executionMaxLosEditDiv').show();
    $('#executionMailEditDiv').hide();
    if (execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].exit == null || execution.trades[execution.trades.length - 1].exit == undefined)) {
      $('#executionOpenTradeEditDiv').show();
    } else {
      $('#executionOpenTradeEditDiv').hide();
    }

    $('#executionPosSizeEdit').val(execution.positionSize);
    $('#executionPosSizeEdit2').val(execution.positionSizeQuoted);
    if (execution.maximumLoss !== null && execution.maximumLoss !== undefined && execution.maximumLoss != 0) {
      $('#executionMaxLossEdit').val(Math.abs(execution.maximumLoss));
    } else {
      $('#executionMaxLossEdit').val('');
    }

    if (execution.type === 'Simulation') {
      $('#executionModeEdit').html('Simulation');
      $('#executionFeeRateEditDiv').show();
      $('#executionFeeRateEdit').val(execution.feeRate);
    } else {
      $('#executionModeEdit').html('Real Trading');
      $('#executionFeeRateEditDiv').hide();
    }

    fillMaxLossDetailsEdit()
    fillPosSizeDetailsEdit()
  }

  $('#editExecutionSaveBtn').unbind('click');
  $('#editExecutionSaveBtn').click(function() {
    saveEditExecutionWindow(id)
  });
  $('#closeOpenTradeBtn').unbind('click');
  $('#closeOpenTradeBtn').click(function() {
    openModalConfirm('Are you sure you want to close your open position at market price?', function() {
      manualCloseOpenTrade(id);
    });
  });

  openModals();
  $('body').css('overflow', 'hidden');
  $('#editExecutionWindow').fadeIn();
}

function calculateUsdtValue(coin, total, prices) {
  if (coin === 'USDT') {
    return total;
  } else if (coin === 'USDC') {
    return total;
  } else if (coin === 'PAX') {
    return total;
  } else if (coin === 'TUSD') {
    return total;
  } else if (coin === 'USDS') {
    return total;
  } else if (coin == 'BTC') {
    return Number.parseFloat(prices['BTCUSDT']) * total;
  } else if (coin == 'BNB') {
    return Number.parseFloat(prices['BNBUSDT']) * total;
  } else if (coin == 'ETH') {
    return Number.parseFloat(prices['ETHUSDT']) * total;
  } else if (prices[coin + 'BTC'] !== undefined) {
    return calculateUsdtValue('BTC', Number.parseFloat(prices[coin + 'BTC']) * total, prices)
  } else if (prices[coin + 'BNB'] !== undefined) {
    return calculateUsdtValue('BNB', Number.parseFloat(prices[coin + 'BNB']) * total, prices)
  }  else if (prices[coin + 'ETH'] !== undefined) {
    return calculateUsdtValue('ETH', Number.parseFloat(prices[coin + 'ETH']) * total, prices)
  } else {
    return 0;
  }
}

async function fillBinanceBalancesTask() {
  while (true) {
    await fillBinanceBalances();
    await sleep(1000 * 60 * 5); // 5 minutes
  }
}

let balanceMutex = new Mutex();
async function fillBinanceBalances() {
  try {
    await balanceMutex.lock();
    if (binanceRealTrading != null) {
      let balance = await getBinanceBalances();
      if (balance == null) {
        return;
      }
      let prices = await getLastBinancePrices()
      let totalBalances = [];
      let totalUsdt = 0;
      for (let coin of Object.keys(balance)) {
        let available = Number.parseFloat(balance[coin].available);
        let onOrder = Number.parseFloat(balance[coin].onOrder);
        let total = available + onOrder;
        let usdt = calculateUsdtValue(coin, total, prices);
        totalUsdt += usdt;
        if (total > 0) {
          totalBalances.push({coin: coin, total: total, available: available, onOrder: onOrder, usdt: usdt})
        }
      }
      totalBalances.sort(function(a, b) {
        return b.usdt - a.usdt;
      });

      $('#tsBalancesDiv').show();
      $('#binanceEstValue').html('<h3>Binance ~ $' + totalUsdt.toFixed(2) + '</h3>as of ' + formatDateFull(new Date()));
      fillPosSizePercent(totalUsdt, prices);
      $('#binanceBalanceTable').html('');
      for (let row of totalBalances) {
        let pecentOfAcc = (row.usdt / totalUsdt) * 100;
        $('#binanceBalanceTable').append('<tr><td>' + row.coin + '</td><td>' + row.total + '</td><td>' + row.available + '</td><td>' + row.onOrder + '</td><td>$' + row.usdt.toFixed(2) + '</td><td>' + pecentOfAcc.toFixed(2) + '%</td></tr>')
      }
    }
  } catch (err) {
    log('error', 'fillBinanceBalances', err.stack)
  } finally {
    await balanceMutex.release();
  }
}

async function sendErrorMail(execution) {
  try {
    let email = await getEmailFromDb();
    if (!sendNotifications || email == null) {
      return;
    }
    let text = 'The execution of strategy "' + execution.strategy.name + '" on instrument ' + execution.instrument + ' was stopped due to the following event:<br><br>' + execution.error;

    $.post("https://easycryptobot.com/mail-error-sender.php", {
      f: 'ecb',
      m: email,
      t: text
    }, function(data, status) {});
  } catch (err) {
    log('error', 'sendErrorMail', err.stack);
  }
}

async function sendTradeMail(execution) {
  try {
    let email = await getEmailFromDb();
    if (!sendNotifications || email == null) {
      return;
    }
    let trade = execution.trades[execution.trades.length - 1];
    let text = '';
    if (trade.exit != undefined && trade.exit != null) {
      text = 'The execution of strategy "' + execution.strategy.name + '" on instrument ' + execution.instrument + ' has sold ' + trade.posSize + ' ' + getBaseCurrency(execution.instrument) + ' at ' + trade.exit.toFixed(8) + ', resulting in ' + trade.result.toFixed(2) + '% ~ ' + trade.resultMoney.toFixed(8) + ' ' + getQuotedCurrency(execution.instrument);
    } else {
      text = 'The execution of strategy ' + execution.strategy.name + ' on instrument ' + execution.instrument + ' has bought ' + trade.posSize + ' ' + getBaseCurrency(execution.instrument) + ' at ' + trade.entry.toFixed(8);
    }
    let executions = await getExecutionsFromDb();
    let executionsText = '';
    for (let executionTmp of executions) {
      if (executionTmp.type === 'Trading') {
        let result = 0;
        let resultMoney = 0;
        for (let trade of executionTmp.trades) {
          if (trade.exit == undefined || trade.exit == null) {
            continue;
          }
          result += trade.result;
          resultMoney += trade.resultMoney;
        }
        executionsText += '<tr><td>' + executionTmp.strategy.name + '</td><td>' + executionTmp.exchange + '</td><td>' + executionTmp.instrument + '</td><td>' + executionTmp.trades.length + '</td><td>' + result.toFixed(2) + '%</td><td>' + resultMoney.toFixed(8) + ' ' + getQuotedCurrency(executionTmp.instrument) + '</td></tr>';
      }
    }
    $.post("https://easycryptobot.com/mail-trade-sender.php", {
      f: 'ecb',
      m: email,
      t: text,
      e: executionsText
    }, function(data, status) {});
  } catch (err) {
    log('error', 'sendTradeMail', err.stack);
  }
}

async function fillPosSizePercent(accountValueUsd, prices) {
  let executions = await getExecutionsFromDb();
  if (executions !== null && executions.length > 0) {
    for (let execution of executions) {
      if (execution.type === 'Trading') {
        let ustdValue = null;
        if (execution.positionSize != null && execution.positionSize != undefined && execution.positionSize > 0) {
          ustdValue = calculateUsdtValue(getBaseCurrency(execution.instrument), execution.positionSize, prices);
        } else {
          ustdValue = calculateUsdtValue(getQuotedCurrency(execution.instrument), execution.positionSizeQuoted, prices);
        }
        let percent = (ustdValue / accountValueUsd) * 100;
        $('#posSizePercent' + execution.id).html(percent.toFixed(2) + '%');
      }
    }
  }
}

function checkApiKey(exchange) {
  if (binanceRealTrading == null) {
    openModalConfirm('<div class="text-justify">Please provide your API key for ' + exchange + '. If you don\'t have a key you can create one under "My Account" page on the ' + exchange + ' website.</div><br><div class="text-left"><span class="inline-block min-width5">API Key:&nbsp;</span><input class="min-width20" id="exchangeApiKey" type="text" placeholder="API KEY" /><br>' + '<span class="inline-block min-width5">Secret:&nbsp;</span><input class="min-width20" id="exchangeApiSecret" type="text" placeholder="Secret" /></div><br><div class="text-justify">Your key and secret are not stored anywhere by this application.</div>', function() {
      verifyKeyAndSecret(exchange);
    }, function() {
      $('#tsExchangeCombobox').html('Choose Exchange');
    });
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
      return false;
    }
    fillBinanceBalancesTask();
    exchangesApiKeys[exchange] = {
      key: key,
      secret: secret
    };
    return true;
  } else {
    openModalInfo('Invalid API Key or Secret!');
    $('#tsExchangeCombobox').html('Choose Exchange');
    return false;
  }
}

async function checkPositionSize(positionSize, exchange, instrument) {
  if (isNaN(positionSize) || positionSize <= 0) {
    openModalInfo('Position Size cannot be less than 0 !');
    return [false];
  }

  let lotSizeInfo = null;
  let instrumentInfo = null;
  if (exchange === 'Binance') {
    instrumentInfo = await getBinanceInstrumentsInfo(instrument);
  }
  if (instrumentInfo === null || instrumentInfo === undefined) {
    openModalInfo('Cannot obtain information for ' + instrument + ' from ' + exchange + ' exchange. Plase try later!');
    return [false];
  } else if (positionSize < instrumentInfo.minQty) {
    openModalInfo('Position Size for ' + instrument + ' cannot be less than ' + instrumentInfo.minQty + ' ' + getBaseCurrency(instrument) + ' on ' + exchange + ' exchange!');
    return [false];
  } else if (positionSize > instrumentInfo.maxQty) {
    openModalInfo('Position Size for ' + instrument + ' cannot be greater than ' + instrumentInfo.maxQty + ' ' + getBaseCurrency(instrument) + ' on ' + exchange + ' exchange!');
    return [false];
  }

  let prices = await getLastBinancePrices();
  curPrice = prices[instrument];
  if (curPrice === undefined) {
    openModalInfo('Cannot obtain information for ' + instrument + ' from ' + exchange + ' exchange. Plase try later!');
    return [false];
  }
  if (curPrice !== null && curPrice * positionSize < instrumentInfo.minNotional) {
    openModalInfo('Position Size for ' + instrument + ' does not meet Binance requirement for minimum trading amount! Try with bigger size than ' + (
    instrumentInfo.minNotional / curPrice).toFixed(8) + ' ' + getBaseCurrency(instrument));
    return [false];
  }

  let newAmount = binanceRoundAmmount(positionSize, instrumentInfo.stepSize); //TODO
  if (newAmount.toFixed(8) !== positionSize.toFixed(8)) {
    openModalInfo('The position size will be rounded to ' + newAmount.toFixed(8) + ' to meet Binance API requirements.');
    positionSize = newAmount;
    return [false, positionSize];
  } else {
    positionSize = newAmount;
    return [true, positionSize];
  }
}

async function checkPositionSizeQuoted(positionSize, exchange, instrument) {
  if (isNaN(positionSize) || positionSize <= 0) {
    openModalInfo('Position Size cannot be less than 0 !');
    return false;
  }
  let prices = await getLastBinancePrices();
  curPrice = Number.parseFloat(prices[instrument]);
  if (curPrice === undefined) {
    openModalInfo('Cannot obtain information for ' + instrument + ' from ' + exchange + ' exchange. Plase try later!');
    return false;
  }
  let positionSizeBase = positionSize / curPrice;

  let lotSizeInfo = null;
  let instrumentInfo = null;
  if (exchange === 'Binance') {
    instrumentInfo = await getBinanceInstrumentsInfo(instrument);
  }
  if (instrumentInfo === null || instrumentInfo === undefined) {
    openModalInfo('Cannot obtain information for ' + instrument + ' from ' + exchange + ' exchange. Plase try later!');
    return false;
  } else if (positionSizeBase < instrumentInfo.minQty) {
    openModalInfo('Position Size for ' + instrument + ' cannot be less than ' + (
    instrumentInfo.minQty * curPrice).toFixed(8) + ' ' + getQuotedCurrency(instrument) + ' on ' + exchange + ' exchange!');
    return false;
  } else if (positionSizeBase > instrumentInfo.maxQty) {
    openModalInfo('Position Size for ' + instrument + ' cannot be greater than ' + (
    instrumentInfo.maxQty * curPrice).toFixed(8) + ' ' + getQuotedCurrency(instrument) + ' on ' + exchange + ' exchange!');
    return false;
  }

  if (curPrice !== null && curPrice * positionSizeBase < instrumentInfo.minNotional) {
    openModalInfo('Position Size for ' + instrument + ' does not meet Binance requirement for minimum trading amount! Try with bigger size than ' + (
    Number.parseFloat(instrumentInfo.minNotional)).toFixed(8) + ' ' + getQuotedCurrency(instrument));
    return false;
  }
  return true;
}

const maxExecutions = 20;
let executionWorkers = [];
const executionMutex = new Mutex();
function hasTradingStrategies() {
  let has = false;
  for (let worker of executionWorkers) {
    if (worker.status === 'running') {
      has = true;
      break;
    }
  }
  return has;
}

async function isStrategyRunning(name) {
  for (let worker of executionWorkers) {
    if (worker.status === 'running') {
      let execution = await getExecutionById(worker.execId)
      if (execution.strategy.name === name) {
        return true;
      }
    }
  }
  return false;
}

async function isStrategyUsedInExecutions(name) {
  let executions = await getExecutionsFromDb();
  for (let execution of executions) {
    if (execution.strategy.name === name) {
      return true;
    }
  }
  return false;
}

async function hasStrategyOpenTrades(name) {
  let executions = await getExecutionsFromDb();
  for (let execution of executions) {
    if (execution.name === name && execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].exit === undefined || execution.trades[execution.trades.length - 1].exit === null)) {
      return [true, execution.strategy.target];
    }
  }
  return [false];
}

async function executeStrategy() {
  try {
    await executionMutex.lock();
    let runningExecutions = $('#tsStrategiesTable tr').length - 1; //First tr is the header
    if (runningExecutions >= maxExecutions) {
      openModalInfo('The maximum executions number is ' + maxExecutions + '. Please remove an execution before starting a new one!');
      return;
    }

    $('#executeStrategyBtn').addClass('disabled');
    showLoading();
    let strategyName = $('#tsStrategyCombobox').text();
    let email = $('#emailBox').val();
    let exchange = $('#tsExchangeCombobox').text();
    let instrument = $('#tsInstrumentSearch').val().toUpperCase();

    if (email.indexOf('@') === -1) {
      email = null;
    } else {
      await updateEmailDb(email);
      await fillEmailField();
    }
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

    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy!');
      $('#tsStrategyCombobox').html('Choose Strategy');
      return;
    }

    let timeframes = getTimeframes(strategy);
    if (timeframes === null) {
      openModalInfo('<h3 class="text-red text-center">ERROR</h3><div class="text-red">Your strategy contains a rule without a timeframe. Please edit your strategy!</div>');
      return;
    }

    let positionSize = '';
    let positionSizeQuoted = '';
    let maxLoss = null;
    let executionType = 'Alerts';
    let feeRate = null;
    if ($('#trExecTypeTrade').is(':checked')) {
      executionType = 'Trading';
    } else if ($('#trExecTypeSim').is(':checked')) {
      executionType = 'Simulation';
      feeRate = Number.parseFloat($('#trFeeBox').val());
      if (isNaN(feeRate) || feeRate <= 0) {
        openModalInfo('Fee rate should be a positive number!');
        return;
      }
    }

    if ($('#trExecTypeTrade').is(':checked') || $('#trExecTypeSim').is(':checked')) {
      positionSize = Number.parseFloat($('#tsPosSize').val());
      if (!isNaN(positionSize)) {
        let posCheck = await checkPositionSize(positionSize, exchange, instrument);
        if (!posCheck[0]) {
          if (posCheck.length > 1) {
            $('#tsPosSize').val(posCheck[1])
          }
          return;
        }
        positionSize = posCheck[1];
      } else {
        positionSizeQuoted = Number.parseFloat($('#tsPosSize2').val());
        let posCheck = await checkPositionSizeQuoted(positionSizeQuoted, exchange, instrument);
        if (!posCheck) {
          return;
        }
      }
      let maxLossTmp = Math.abs(Number.parseFloat($('#tsMaxLoss').val()));
      if (!isNaN(maxLossTmp) && maxLossTmp != 0) {
        maxLoss = (-1) * Math.abs(maxLossTmp);
      }
    }

    $('#tsResultDiv').show();

    let dbId = Math.floor((Math.random() * 8999999999) + 1000000000);
    let execTmp = await getExecutionById(dbId);
    while (execTmp !== null) {
      dbId = Math.floor((Math.random() * 8999999999) + 1000000000);
      execTmp = await getExecutionById(dbId);
    }
    let date = new Date();
    let curExecution = {
      id: dbId,
      date: date.getTime(),
      type: executionType,
      name: strategyName,
      strategy: strategy,
      exchange: exchange,
      instrument: instrument,
      positionSize: positionSize,
      positionSizeQuoted: positionSizeQuoted,
      status: 'starting',
      maximumLoss: maxLoss,
      trades: [],
      trailingSlPriceUsed: null,
      email: email,
      feeRate: feeRate,
      timeframes: timeframes,
      minNotionalAmountLeft: 0
    }
    addExecutionToDb(curExecution);
    let resStr = '0.00%';
    if (executionType === "Alerts") {
      resStr = '';
    }

    $('#tsStrategiesTable').append('<tr id="executionTableItem' + dbId + '"><td>' + executionType + '</td><td id="executionName' + dbId + '">' + strategyName + '</td><td>' + exchange + '</td><td>' + instrument + '</td><td class="text-center" id="posSizePercent' + dbId + '"></td><td class="text-center" id="executedTrades' + dbId + '">0</td><td class="text-center" id="openTrade' + dbId + '"></td><td class="text-right"><span id="executionRes' + dbId + '">' + resStr + '</span></td><td><a title="Detailed Results" href="#executionDetailsLabel" onclick="showExecutionResult(\'' + dbId + '\')"><i class="far fa-file-alt"></i></a></td><td class="text-center" id="lastUpdatedExecution' + dbId + '"></td><td id="statusStr' + dbId + '">Starting</td><td id="actionsBtns' + dbId + '"></td></tr>');
    if (executionType === 'Trading') {
      fillBinanceBalances();
    }
    await runStrategy(dbId);
    openModalInfo('Strategy ' + strategyName + ' was started for ' + instrument);
  } catch (err) {
    log('error', 'executeStrategy', err.stack);
    openModalInfo('Internal Error Occurred!<br>' + err.stack);
  } finally {
    hideLoading();
    $('#executeStrategyBtn').removeClass('disabled');
    await executionMutex.release();
  }
}

async function runStrategy(id) {
  try {
    let maxLossReached = await checkMaxLossReached(id);
    if (maxLossReached) {
      return false;
    }
    //Check if execution already exists
    for (let worker of executionWorkers) {
      if (worker.execId === id) {
        if (worker.status === 'running') {
          return false
        } else if (worker.status === 'paused') {
          setStatusAndActions(id, 'Starting');
          worker.status = 'running'
          worker.wk.postMessage('RESUME');
          return true;
        }
      }
    }

    setStatusAndActions(id, 'Starting');
    let execution = await getExecutionById(id);

    let timeframes = getTimeframes(execution.strategy);
    if (timeframes === null) {
      let errorMsg = 'Your strategy contains a rule without a timeframe. Please remove this execution and edit your strategy!';
      execution.error = errorMsg;
      await updateExecutionDb(execution);
      setStatusAndActions(id, 'Error', errorMsg);
      openModalInfoBig('<h3 class="text-red text-center">ERROR</h3><div class="text-red">' + errorMsg + '</div>');
      return false;
    }

    if (execution.type === 'Trading') {
      if (exchangesApiKeys[execution.exchange] === undefined) {
        openModalConfirm('<div class="text-justify">Please provide your API key for ' + execution.exchange + '. </div><br><div class="text-left"><span class="inline-block min-width5">API Key:&nbsp;</span><input class="min-width20" id="exchangeApiKey" type="text" placeholder="API KEY" /><br>' + '<span class="inline-block min-width5">Secret:&nbsp;</span><input class="min-width20" id="exchangeApiSecret" type="text" placeholder="Secret" /></div><br><div class="text-justify">Your key and secret are not stored anywhere by this application.</div>', async function() {
          let result = await verifyKeyAndSecret(execution.exchange);
          if (result) {
            runStrategy(id);
          } else {
            setStatusAndActions(id, 'Stopped');
          }
        }, function() {
          openModalInfoBig("Cannot run strategy in Real Trading mode without connection to the exchange via your API Key and Secret!");
          setStatusAndActions(id, 'Stopped');
        });
        return false;
      }
    }

    let apiKey = 'api-key';
    let apiSecret = 'api-secret';
    if (execution.type === 'Trading') {
      apiKey = exchangesApiKeys[execution.exchange].key;
      apiSecret = exchangesApiKeys[execution.exchange].secret;
    }

    let hasFreeWorker = false;
    for (let worker of executionWorkers) {
      if (worker.status === 'free') {
        worker.status = 'running';
        worker.execId = id;
        hasFreeWorker = true;
        worker.wk.postMessage([execution, apiKey, apiSecret]);
        break;
      }
    }

    if (!hasFreeWorker) {
      let wk = null;
      if (execution.exchange === 'Binance') {
        wk = new Worker("./assets/js/binance-execution.js");
      }
      wk.addEventListener('error', function(e) {
        log('error', 'runStrategy', 'Internal Error Occurred!!<br>' + execution.type + ' ' + e.message + '<br>' + e.filename + ' ' + e.lineno);
        openModalInfo('Internal Error Occurred!!<br>' + execution.type + ' ' + e.message + '<br>' + e.filename + ' ' + e.lineno);
      }, false);

      const runMutex = new Mutex();
      wk.addEventListener("message", async function(e) {
        try {
          await runMutex.lock();
          let id = e.data[0];
          let execution = await getExecutionById(id);
          let type = e.data[1];
          let data = e.data[2];
          let additionalData = e.data[3];
          switch (type) {
            case 'STARTED':
              setStatusAndActions(id, 'Running');
              break;
            case 'STOPPED':
              $('#executeStrategyBtn').removeClass('disabled');
              let errMsg = 'Execution of strategy ' + execution.name + ' on exchang ' + execution.exchange + ' for instrument ' + execution.instrument + ' has failed to start!';
              setStatusAndActions(id, 'Error', errMsg);
              openModalInfoBig(errMsg);
              break;
            case 'ERROR':
              let errorMsg = data.replace(/[^a-z0-9 !,.;:()-_=+]/gi, ' ') + '<br><br>The execution of the strategy was stopped!';
              await stopStrategyExecution(id, errorMsg);
              execution.error = errorMsg;
              await updateExecutionDb(execution);
              showErrorMsg(errorMsg, id);
              log('error', 'runStrategy webworker listener', errorMsg);
              if (execution.type === 'Trading') {
                sendErrorMail(execution);
              }
              break;
            case 'LAST_UPDATED':
              $('#lastUpdatedExecution' + id).html(formatDateNoYear(new Date()));
              break;
            case 'STALLED':
              setStatusAndActions(id, 'Stalled');
              break;
            case 'MSG':
              openModalInfoBig(data);
              break;
            case 'TRAILING_STOP_PRICE':
              execution.trailingSlPriceUsed = data;
              await updateExecutionDb(execution);
              break;
            case 'CH_POS_SIZE':
              execution.positionSize = data;
              await updateExecutionDb(execution);
              break;
            case 'TAKE_PROFIT_ORDER_ID':
              execution.takeProfitOrderId = data;
              await updateExecutionDb(execution);
              if (execution.type === 'Trading') {
                fillBinanceBalances();
              }
              break;
            case 'MIN_NOTIONAL':
              execution.minNotionalAmountLeft = data;
              await updateExecutionDb(execution);
              break;
            case 'BUY':
              if (execution.type === 'Alerts') {
                execution.trades.push({type: 'Buy', date: additionalData, entry: data});
                openModalInfo('BUY Alert!<br><div class="text-left">Strategy: ' + execution.name + '<br>Exchange: ' + execution.exchange + '<br>Instrument: ' + execution.instrument + '<br>Date: ' + formatDateFull(additionalData) + '<br>Entry Price: ' + data);
                sendEmail(execution, 'BUY', additionalData, data);
              } else {
                execution.trades.push(data);
              }
              if (execution.type === 'Trading' && execution.feeRate === null || execution.feeRate === undefined) {
                execution.feeRate = additionalData;
              }
              await updateExecutionDb(execution);
              $('#executedTrades' + id).html(execution.trades.length);
              $('#openTrade' + id).html('<i class="fa fa-check"></i>');
              if (execution.type === 'Trading') {
                fillBinanceBalances();
                sendTradeMail(execution);
              }
              break;
            case 'SELL':
              if (execution.type === 'Alerts') {
                execution.trades.push({type: 'Sell', date: additionalData, entry: data});
                await updateExecutionDb(execution, execution.trades);
                $('#executedTrades' + id).html(execution.trades.length);
                openModalInfo('SELL Alert!<br><div class="text-left">Strategy: ' + execution.name + '<br>Exchange: ' + execution.exchange + '<br>Instrument: ' + execution.instrument + '<br>Date: ' + formatDateFull(additionalData) + '<br>Entry Price: ' + data);
                sendEmail(execution, 'SELL', additionalData, data);
              } else {
                execution.trades[execution.trades.length - 1] = data;
                execution.takeProfitOrderId = null;
                await updateExecutionDb(execution);
                fillExecResInTable(execution.trades, id);
                $('#openTrade' + id).html('');
                await checkMaxLossReached(id);
                if (execution.type === 'Trading') {
                  fillBinanceBalances();
                  sendTradeMail(execution);
                }
              }
              break;

            case 'LOG':
              log('warning', 'binance-execution', data)
              break;
            default:
          };
        } catch (err) {
          log('error', 'runStrategy', err.stack);
          openModalInfo('Internal Error Occurred!!!<br>' + err.stack);
        } finally {
          await runMutex.release();
        }
      }, false);

      executionWorkers.push({status: 'running', execId: id, wk: wk});
      wk.postMessage([execution, apiKey, apiSecret]);
      return true;
    }
  } catch (err) {
    log('error', 'runStrategy', err.stack);
    openModalInfo('Internal Error Occurred!!!!<br>' + err.stack);
  }
}

async function stopStrategyExecution(id, errorMsg, dontWait, terminate) {
  setStatusAndActions(id, 'Stopping');
  for (let worker of executionWorkers) {
    if (worker.execId == id) {
      worker.status = 'paused';
      if (terminate) {
        worker.wk.postMessage('DELAYED_TERMINATE');
      } else {
        worker.wk.postMessage('PAUSE');
      }
      break;
    }
  }
  if (!dontWait) {
    await sleep(1000);
  }

  if (errorMsg !== null && errorMsg !== undefined && errorMsg.indexOf('Max Loss') == 0) {
    setStatusAndActions(id, 'MaxLoss', errorMsg);
  } else if (errorMsg !== null && errorMsg !== undefined) {
    setStatusAndActions(id, 'Error', errorMsg);
  } else {
    setStatusAndActions(id, 'Stopped');
  }
}

async function stopAllExecutions(terminate) {
  try {
    showLoading();
    let useSleep = hasTradingStrategies();
    let executions = await getExecutionsFromDb();
    if (executions !== null && executions.length > 0) {
      for (let execution of executions) {
        if (execution.error === null || execution.error === undefined) {
          await stopStrategyExecution(execution.id, null, true);
        }
      }
    }
    if (useSleep) {
      await sleep(3000);
    }
  } finally {
    hideLoading();
  }
}

async function startAllSimulations(executions) {
  let hasNewStarts = false;
  for (let execution of executions) {
    if (execution.error === null || execution.error === undefined) {
      if (execution.type != 'Trading') {
        let res = await runStrategy(execution.id);
        if (res == true) {
          hasNewStarts = true;
        }
      }
    }
  }
  if (hasNewStarts) {
    await sleep(2000);
  }
}

async function startAllExecutions() {
  try {
    showLoading();
    let executions = await getExecutionsFromDb();
    if (executions !== null && executions.length > 0) {
      let hasRealTrading = false;
      //TODO: This will not work when more exchanges are added
      let exchange = null;
      for (let execution of executions) {
        if (execution.error === null || execution.error === undefined) {
          if (execution.type == 'Trading') {
            hasRealTrading = true;
            exchange = execution.exchange;
            break;
          }
        }
      }

      if (hasRealTrading) {
        if (binanceRealTrading == null) {
          openModalConfirm('<div class="text-justify">Please provide your API key for ' + exchange + '. </div><br><div class="text-left"><span class="inline-block min-width5">API Key:&nbsp;</span><input class="min-width20" id="exchangeApiKey" type="text" placeholder="API KEY" /><br>' + '<span class="inline-block min-width5">Secret:&nbsp;</span><input class="min-width20" id="exchangeApiSecret" type="text" placeholder="Secret" /></div><br><div class="text-justify">Your key and secret are not stored anywhere by this application.</div>', async function() {
            let result = await verifyKeyAndSecret(exchange);
            if (result) {
              startAllExecutions();
            } else {
              startAllSimulations(executions);
            }
          }, async function() {
            openModalInfoBig("In order to start Real Trading strategies you need to provide your API Key and Secret!");
            await startAllSimulations(executions);
          });
          return;
        } else {
          let hasNewStarts = false;
          for (let execution of executions) {
            if (execution.error === null || execution.error === undefined) {
              let res = await runStrategy(execution.id);
              if (res == true) {
                hasNewStarts = true;
              }
            }
          }
          if (hasNewStarts) {
            await sleep(2000);
          }
        }
      } else {
        await startAllSimulations(executions);
      }
    }
  } catch (err) {
    log('error', 'startAllExecutions', err.stack);
  } finally {
    hideLoading();
  }
}

let manuallyClosingTrade = false;
async function manualCloseOpenTrade(id) {
  manuallyClosingTrade = true;
  $('#closeOpenTradeBtn').addClass('disabled');
  let execution = await getExecutionById(id);
  if (execution.type === 'Simulation') {
    let curPrice = null;
    for (let i = 0; i < 10; i++) {
      let bidAsk = await getBinanceBidAsk(execution.instrument);
      if (isNaN(bidAsk[0])) {
        await sleep(100);
      } else {
        curPrice = bidAsk[0];
        break;
      }
    }
    if (curPrice == null) {
      openModalInfo('Could not obtain data from Binance. Please try Later!');
      manuallyClosingTrade = false;
      $('#closeOpenTradeBtn').removeClass('disabled');
      return;
    }
    let tradeIndex = execution.trades.length - 1;
    execution.trades[tradeIndex]['closeDate'] = new Date();
    execution.trades[tradeIndex]['exit'] = curPrice;
    execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - (execution.feeRate * 2);
    execution.trades[tradeIndex]['resultMoney'] = (execution.trades[tradeIndex]['result'] / 100) * (execution.positionSize * curPrice);
    await updateExecutionDb(execution);
    fillExecResInTable(execution.trades, execution.id);
    $('#openTrade' + execution.id).html('');
  } else if (execution.type === 'Trading') {
    if (binanceRealTrading == null) {
      openModalConfirm('<div class="text-justify">Please provide your API key for ' + execution.exchange + '. </div><br><div class="text-left"><span class="inline-block min-width5">API Key:&nbsp;</span><input class="min-width20" id="exchangeApiKey" type="text" placeholder="API KEY" /><br>' + '<span class="inline-block min-width5">Secret:&nbsp;</span><input class="min-width20" id="exchangeApiSecret" type="text" placeholder="Secret" /></div><br><div class="text-justify">Your key and secret are not stored anywhere by this application.</div>', async function() {
        let result = await verifyKeyAndSecret(execution.exchange);
        if (result) {
          manualCloseOpenTrade(id);
        } else {
          openModalInfoBig("Cannot close trade in Real Trading mode without connection to the exchange via your API Key and Secret!");
        }
      }, function() {
        openModalInfoBig("Cannot close trade in Real Trading mode without connection to the exchange via your API Key and Secret!");
      });
      $('#closeOpenTradeBtn').removeClass('disabled');
      manuallyClosingTrade = false;
      return;
    } else {
      let finalPrice = await binanceMarketSell(execution)
      if (finalPrice == null) {
        $('#closeOpenTradeBtn').removeClass('disabled');
        manuallyClosingTrade = false;
        return;
      }

      let tradeIndex = execution.trades.length - 1;
      execution.trades[tradeIndex]['closeDate'] = new Date();
      execution.trades[tradeIndex]['exit'] = finalPrice;
      execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - (execution.feeRate * 2);
      execution.trades[tradeIndex]['resultMoney'] = (execution.trades[tradeIndex]['result'] / 100) * (execution.positionSize * finalPrice);
      execution.takeProfitOrderId = null;
      for (let worker of executionWorkers) {
        if (worker.execId == id) {
          worker.wk.postMessage(['UPDATE_TRADE', finalPrice]);
          await sleep(1000);
          break;
        }
      }
      await updateExecutionDb(execution);
      fillExecResInTable(execution.trades, execution.id);
      $('#openTrade' + execution.id).html('');
      await checkMaxLossReached(execution.id);
      fillBinanceBalances();
    }
  }
  $('#closeOpenTradeBtn').removeClass('disabled');
  manuallyClosingTrade = false;
}

async function saveEditExecutionWindow(id) {
  try {
    showLoading();
    while (manuallyClosingTrade) {
      await sleep(500);
    }
    let execution = await getExecutionById(id);
    if (execution.type === 'Alerts') {
      let email = $('#executionEmailEdit').val();
      if (email.indexOf('@') === -1) {
        email = null;
      }
      execution.email = email;
    } else {
      let positionSize = Number.parseFloat($('#executionPosSizeEdit').val());
      if (!isNaN(positionSize)) {
        let posCheck = await checkPositionSize(positionSize, execution.exchange, execution.instrument);
        if (!posCheck[0]) {
          if (posCheck.length > 1) {
            $('#executionPosSizeEdit').val(posCheck[1])
          }
          return;
        }
        positionSize = posCheck[1];
        if (execution.positionSize !== positionSize && (execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].exit == null || execution.trades[execution.trades.length - 1].exit == undefined))) {
          openModalInfoBig('<h3 class="text-center">Error</h3>Editing the position size is not allowed while there is an open trade.<br>Click on the "Close Open Trade" button before changing the position size!');
          return;
        }
        execution.positionSize = positionSize;
        execution.positionSizeQuoted = null;
      } else {
        let positionSizeQuoted = Number.parseFloat($('#executionPosSizeEdit2').val());
        let posCheck = await checkPositionSizeQuoted(positionSizeQuoted, execution.exchange, execution.instrument);
        if (!posCheck) {
          return;
        }
        if (execution.positionSizeQuoted !== positionSizeQuoted && (execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].exit == null || execution.trades[execution.trades.length - 1].exit == undefined))) {
          openModalInfoBig('<h3 class="text-center">Error</h3>Editing the position size is not allowed while there is an open trade.<br>Click on the "Close Open Trade" button before changing the position size!');
          return;
        }
        execution.positionSizeQuoted = positionSizeQuoted;
        execution.positionSize = null;
      }

      let maxLossTmp = Math.abs(Number.parseFloat($('#executionMaxLossEdit').val()));

      if (!isNaN(maxLossTmp) && maxLossTmp !== 0) {
        execution.maximumLoss = (-1) * maxLossTmp;
      } else {
        execution.maximumLoss = null;
      }
      if (execution.type === 'Simulation') {
        let feeRate = Number.parseFloat($('#executionFeeRateEdit').val());
        if (isNaN(feeRate) || feeRate <= 0) {
          openModalInfo('Fee rate should be a positive number!');
          return;
        }
        execution.feeRate = feeRate;
      }
    }
    fillBinanceBalances();
    await updateExecutionDb(execution);

    for (let worker of executionWorkers) {
      if (worker.execId == id) {
        worker.wk.postMessage(['UPDATE_EXECUTION', execution]);
        await sleep(1000);
        break;
      }
    }

    closeEditExecutionWindow();
  } catch (err) {
    log('error', 'saveEditExecutionWindow', err.stack);
  } finally {
    hideLoading();
  }
}

function posSizeInfo() {
  openModalInfo('The column "Pos. Size %" shows how much is the position size relative to the current account value.');
}

function lastTickInfo() {
  openModalInfo('The "Last Tick" shows the time of the last price for the instrument received from the exchange.');
}

async function updateExecutionStrategy(name, orgName) {
  let strategy = await getStrategyByName(name);
  let executions = await getExecutionsFromDb();
  for (let execution of executions) {
    if (execution.strategy.name === orgName) {
      execution.strategy = strategy;
      execution.name = name;
      await updateExecutionDb(execution);
      $('#executionName' + execution.id).html(name);
      for (let worker of executionWorkers) {
        if (worker.execId === execution.id) {
          worker.wk.postMessage(['UPDATE_STRATEGY', strategy]);
          break;
        }
      }
    }
  }
}

async function fillEmailField() {
  let email = await getEmailFromDb();
  if (email != null) {
    $('#emailBox').val(email);
    $('#bugEmail').val(email);
  }
}
fillEmailField();
