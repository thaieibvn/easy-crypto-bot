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

function checkApiKey(exchange) {
  if (binanceRealTrading == null) {
    openModalConfirm('<div class="text-justify">Please provide your API key for ' + exchange + '. If you don\'t have a key you can create one under "My Account" page on the ' + exchange + ' website.</div><br><div class="text-left"><span class="inline-block min-width5">API Key:&nbsp;</span><input class="min-width20" id="exchangeApiKey" type="text" placeholder="API KEY" /><br>' + '<span class="inline-block min-width5">Secret:&nbsp;</span><input class="min-width20" id="exchangeApiSecret" type="text" placeholder="Secret" /></div><br><div class="text-justify">Your key and secret are not stored anywhere by this application.</div>', function() {
      verifyKeyAndSecret(exchange);
    }, function() {
      $('#tsExchangeCombobox').html('Choose Exchange');
    });
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
  } catch (err) {
    log('error', 'tsInstrumentKeyup', err.stack);
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
  if (instrument.length <= 0 || getQuotedCurrency(instrument) === '' || getBaseCurrency(instrument) === '') {
    $('#tsQuotedCurrency').html('');
    return;
  }
  $('#tsQuotedCurrency').html(getBaseCurrency(instrument));

  let value = $('#tsPosSize').val();
  if (value.length > 0 && Number.parseFloat(value) > 0) {
    let ustdValue = await getBinanceUSDTValue(Number.parseFloat(value), instrument, getQuotedCurrency(instrument));
    if (ustdValue != null && !isNaN(ustdValue) && $('#tsPosSize').val() == value) {
      $('#tsQuotedCurrency').html(getBaseCurrency(instrument) + ' (~ $' + ustdValue.toFixed(2) + ' )');
    }
  }
}

async function fillPosSizeDetailsEdit() {
  let instrument = $('#executionInstrumentEdit').html().toUpperCase();
  if (instrument.length <= 0 || getQuotedCurrency(instrument) === '' || getBaseCurrency(instrument) === '') {
    $('#tsQuotedCurrencyEdit').html('');
    return;
  }
  $('#tsQuotedCurrencyEdit').html(getBaseCurrency(instrument));

  let value = $('#executionPosSizeEdit').val();
  if (value.length > 0 && Number.parseFloat(value) > 0) {
    let ustdValue = await getBinanceUSDTValue(Number.parseFloat(value), instrument, getQuotedCurrency(instrument));
    if (ustdValue != null && !isNaN(ustdValue) && $('#executionPosSizeEdit').val() == value) {
      $('#tsQuotedCurrencyEdit').html(getBaseCurrency(instrument) + ' (~ $' + ustdValue.toFixed(2) + ' )');
    }
  }
}

async function fillMaxLossDetails() {
  let instrument = $('#tsInstrumentSearch').val().toUpperCase();
  if (instrument.length <= 0 || getQuotedCurrency(instrument) === '' || getBaseCurrency(instrument) === '') {
    $('#tsMaxLossCurrency').html('');
    return;
  }
  $('#tsMaxLossCurrency').html(getQuotedCurrency(instrument));

  let value = Math.abs(Number.parseFloat($('#tsMaxLoss').val()));
  if (!isNaN(value) && value!= 0) {
    let prices = await getLastBinancePrices();
    let ustdValue = calculateUsdtValue(getQuotedCurrency(instrument), value, prices);
    if (ustdValue != null && !isNaN(ustdValue) && Math.abs(Number.parseFloat($('#tsMaxLoss').val())) == value) {
      $('#tsMaxLossCurrency').html(getQuotedCurrency(instrument) + ' (~ $' + ustdValue.toFixed(2) + ' )');
    }
  }
}

async function fillMaxLossDetailsEdit() {
  let instrument = $('#executionInstrumentEdit').html().toUpperCase();
  if (instrument.length <= 0 || getQuotedCurrency(instrument) === '' || getBaseCurrency(instrument) === '') {
    $('#tsMaxLossCurrencyEdit').html('');
    return;
  }
  $('#tsMaxLossCurrencyEdit').html(getQuotedCurrency(instrument));

  let value = Math.abs(Number.parseFloat($('#executionMasLossEdit').val()));
  if (!isNaN(value) && value != 0) {
    let prices = await getLastBinancePrices();
    let ustdValue = calculateUsdtValue(getQuotedCurrency(instrument), value, prices);
    if (ustdValue != null && !isNaN(ustdValue) && Math.abs(Number.parseFloat($('#executionMasLossEdit').val())) == value) {
      $('#tsMaxLossCurrencyEdit').html(getQuotedCurrency(instrument) + ' (~ $' + ustdValue.toFixed(2) + ' )');
    }
  }
}

const maxExecutions = 20;
const executionMutex = new Mutex();
const runningEndpoint = {};
function hasTradingStrategies() {
  return Object.keys(runningEndpoint).length > 0;
}

function getEndpointName(execution) {
  let timeframes = getTimeframes(execution.strategy);
  if (timeframes === null) {
    return 'UNKNOWN'
  }
  return execution.instrument.toLowerCase() + '@kline_' + getShortTimeframe(timeframes[0]);
}

async function executeStrategy() {
  try {
    await executionMutex.lock();
    let runningExecutions = $('#tsStrategiesTable tr').length - 1; //First tr is the header
    if (runningExecutions >= maxExecutions) {
      openModalInfo('The maximum executions number is ' + maxExecutions + '. Please remove an execution before starting new one!');
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
    let executions = await getExecutionsFromDb();
    if (executions !== null && executions.length > 0) {
      for (let execution of executions) {
        if (getTimeframes(execution.strategy) != null && execution.instrument.toLowerCase() === instrument.toLowerCase() && getTimeframes(strategy)[0] === getTimeframes(execution.strategy)[0]) {
          openModalInfo('Execution on ' + instrument + ' on ' + getTimeframes(strategy)[0] + ' timeframe already exists! Only one execution for the same instument and timeframe is allowed!');
          return;
        }
      }
    }

    let timeframes = getTimeframes(strategy);
    if (timeframes === null) {
      openModalInfo('<h3 class="text-red text-center">ERROR</h3><div class="text-red">Your strategy contains a rule without a timeframe. Please edit your strategy!</div>');
      return;
    }

    let positionSize = '';
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
      let posCheck = await checkPositionSize(positionSize, exchange, instrument);
      if (!posCheck[0]) {
        if (posCheck.length > 1) {
          $('#tsPosSize').val(posCheck[1])
        }
        return;
      }
      positionSize = posCheck[1];
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
      status: 'starting',
      maximumLoss: maxLoss,
      trades: [],
      trailingSlPriceUsed: null,
      email: email,
      feeRate: feeRate,
      timeframes: timeframes
    }
    addExecutionToDb(curExecution);
    let resStr = '0.00%';
    if (executionType === "Alerts") {
      resStr = '';
    }

    $('#tsStrategiesTable').append('<tr id="executionTableItem' + dbId + '"><td>' + executionType + '</td><td>' + strategyName + '</td><td>' + exchange + '</td><td>' + instrument + '</td><td class="text-center" id="executedTrades' + dbId + '">0</td><td class="text-center" id="openTrade' + dbId + '"></td><td><span id="executionRes' + dbId + '">' + resStr + '</span>&nbsp;' + '<a title="Detailed Results" href="#executionDetailsLabel" onclick="showExecutionResult(\'' + dbId + '\')"><i class="far fa-file-alt"></i></a>&nbsp;</td>' + '<td id="lastUpdatedExecution' + dbId + '"></td><td id="statusStr' + dbId + '">Starting</td><td id="actionsBtns' + dbId + '"></td></tr>');

    await runStrategy(dbId);
    /*$('html,body').animate({
      scrollTop: document.body.scrollHeight
    }, "fast");
    */

  } catch (err) {
    log('error', 'executeStrategy', err.stack);
    openModalInfo('Internal Error Occurred!<br>' + err.stack);
  } finally {
    hideLoading();
    $('#executeStrategyBtn').removeClass('disabled');
    executionMutex.release();
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
    openModalInfo('Position Size for ' + instrument + ' cannot be less than ' + instrumentInfo.minQty + ' on ' + exchange + ' exchange!');
    return [false];
  } else if (positionSize > instrumentInfo.maxQty) {
    openModalInfo('Position Size for ' + instrument + ' cannot be greater than ' + instrumentInfo.maxQty + ' on ' + exchange + ' exchange!');
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
    instrumentInfo.minNotional / curPrice).toFixed(8));
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
    let errorMsg = 'Execution of ' + execution.name + ' on ' + execution.exchange + ' for ' + execution.instrument + ' has reached the maximum loss of ' + execution.maximumLoss + ' ' + getQuotedCurrency(execution.instrument)+'. If you want to continue the execution, you have to edit the Max Loss field of the execution.';
    stopStrategyExecution(id, errorMsg);
    openModalInfoBig('<h3 class="text-center">Error</h3>' + errorMsg + '<br>The execution was stopped.');
    execution.error = errorMsg;
    await updateExecutionDb(execution);
    return true;
  }
  return false;
}

function maxLossInfo() {
  openModalInfoBig('If the total result of all closed trades exeeds the defined Maximum Loss the execution of the strategy will stop automatically.<br>Please take in mind that this is not a single trade stoploss and only fully closed trades are used for the calculation. This means that if an open trade exeeds the Maximum loss the execution will not be stopped until the trade is closed and the total loss may exeeds the defined Max Loss value! You can define a single trade stoploss in your strategy.');
}

function setStatusAndActions(id, status, errorMsg) {
  if (status === 'Error') {
    $('#statusStr' + id).html('<span class="text-red">Error&nbsp;<a title="Show Error" href="#/" onclick="showErrorMsg(\'' + errorMsg + '\', ' + id + ')"><i class="fas fa-question-circle"></i></a></span>');
    $('#actionsBtns' + id).html('<a title="Clear Error" href="#/" onclick="clearError(' + id + ')"><i class="fas fa-recycle"></i></a>&nbsp;&nbsp;<a title="Edit Execution" href="#/" onclick="editExecution(' + id + ')"><i class="far fa-edit"></i></a>&nbsp;&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-trash"></i></a>');
  } else if (status === 'Stopped') {
    $('#statusStr' + id).html('Stopped');
    $('#actionsBtns' + id).html('<a class="text-green" title="Resume Execution" href="#/" onclick="runStrategy(' + id + ')"><i class="fas fa-play"></i></a>&nbsp;&nbsp;<a title="Edit Execution" href="#/" onclick="editExecution(' + id + ')"><i class="far fa-edit"></i></a>&nbsp;&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-trash"></i></a>');
  } else if (status === 'Running') {
    $('#statusStr' + id).html('Running');
    $('#actionsBtns' + id).html('<a class="stop-stgy-exec text-red" title="Stop Execution" href="#/" onclick="stopStrategyExecution(' + id + ')"><i class="fas fa-stop"></i></a>');
  } else {
    $('#statusStr' + id).html(status);
    $('#actionsBtns' + id).html('');
  }
}

async function checkDuplicateInstrumetns(execution) {
  if (runningEndpoint[getEndpointName(execution)] !== undefined) {
    let errorMsg = 'Execution on ' + execution.instrument + ' on ' + getTimeframes(execution.strategy)[0] + ' timeframe already exists! Only one execution for the same instument and timeframe is allowed!';
    execution.error = errorMsg;
    await updateExecutionDb(execution);
    setStatusAndActions(execution.id, 'Error', errorMsg);
    openModalInfoBig('<h3 class="text-red text-center">ERROR</h3><div class="text-red">' + errorMsg + '</div>');
    return true;
  }
  return false;
}

async function runStrategy(id) {
  try {
    setStatusAndActions(id, 'Starting');
    let execution = await getExecutionById(id);

    let maxLossReached = await checkMaxLossReached(execution.id);
    if (maxLossReached) {
      return;
    }

    let timeframes = getTimeframes(execution.strategy);
    if (timeframes === null) {
      let errorMsg = 'Your strategy contains a rule without a timeframe. Please remove this execution and edit your strategy!';
      execution.error = errorMsg;
      await updateExecutionDb(execution);
      setStatusAndActions(id, 'Error', errorMsg);
      openModalInfoBig('<h3 class="text-red text-center">ERROR</h3><div class="text-red">' + errorMsg + '</div>');
      return;
    }

    if (execution.type === 'Trading') {
      if (binanceRealTrading == null) {
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
        return;
      }

      let duplicated = await checkDuplicateInstrumetns(execution);
      if (!duplicated) {
        runningEndpoint[getEndpointName(execution)] = execution.id;
        startBinanceWebsocket(execution, binanceRealTrading);

      }
    } else {
      let duplicated = await checkDuplicateInstrumetns(execution);
      if (!duplicated) {
        runningEndpoint[getEndpointName(execution)] = execution.id;
        startBinanceWebsocket(execution, binance);
      }
    }

  } catch (err) {
    log('error', 'runStrategy', err.stack);
    openModalInfo('Internal Error Occurred!!!!<br>' + err.stack);
  }
}

function getOrderTradePrice(execution, orderId, type) {
  return new Promise((resolve, reject) => {
    binanceRealTrading.useServerTime(function() {
      binanceRealTrading.trades(execution.instrument, async (error, tradesTmp, symbol) => {
        let qty = 0;
        let sum = 0;
        let commision = 0;
        let bnbCommision = 0;
        for (let i = tradesTmp.length - 1; i >= 0; i--) {
          if (tradesTmp[i].orderId == orderId) {
            sum += Number.parseFloat(tradesTmp[i].price) * Number.parseFloat(tradesTmp[i].qty);
            qty += Number.parseFloat(tradesTmp[i].qty);

            if (tradesTmp[i].commissionAsset !== 'BNB') {
              commision += Number.parseFloat(tradesTmp[i].commission);
              if (execution.feeRate === null || execution.feeRate === undefined) {
                try {
                  execution.feeRate = (Number.parseFloat(tradesTmp[i].commission) / qty) * 100;
                  if (execution.feeRate > 0.095) {
                    execution.feeRate = 0.1;
                  } else if (feeRate > 0.085) {
                    execution.feeRate = 0.09
                  } else if (feeRate > 0.075) {
                    execution.feeRate = 0.08
                  } else if (feeRate > 0.065) {
                    execution.feeRate = 0.07
                  } else if (feeRate > 0.055) {
                    execution.feeRate = 0.06
                  } else if (feeRate > 0.045) {
                    execution.feeRate = 0.03
                  } else if (feeRate > 0.035) {
                    execution.feeRate = 0.02
                  }
                } catch (err) {
                  execution.feeRate = 0.1;
                }
              }
            } else {
              bnbCommision += Number.parseFloat(tradesTmp[i].commission);
            }
          }
        }

        if (execution.feeRate === null || execution.feeRate === undefined) {
          try {
            let usdtQty = await getBinanceUSDTValue(qty, execution.instrument, getQuotedCurrency(execution.instrument));
            let usdtCommission = await getBinanceUSDTValue(bnbCommision, 'BNBUSDT', 'USDT');
            execution.feeRate = (usdtCommission / usdtQty) * 100;
            if (execution.feeRate > 0.07) {
              execution.feeRate = 0.075;
            } else if (feeRate > 0.065) {
              execution.feeRate = 0.0675
            } else if (feeRate > 0.058) {
              execution.feeRate = 0.06
            } else if (feeRate > 0.049) {
              execution.feeRate = 0.0525
            } else if (feeRate > 0.04) {
              execution.feeRate = 0.045
            } else if (feeRate > 0.035) {
              execution.feeRate = 0.0375
            } else if (feeRate > 0.028) {
              execution.feeRate = 0.03
            } else if (feeRate > 0.02) {
              execution.feeRate = 0.0225
            } else if (feeRate > 0.01) {
              execution.feeRate = 0.015
            }
          } catch (err) {
            execution.feeRate = 0.075;
          }
        }

        if (execution.feeRate === null || execution.feeRate === undefined || isNaN(execution.feeRate)) {
          execution.feeRate = 0.075;
        }

        if (qty !== 0) {
          if (commision !== 0 && type === 'buy') {
            let balance = await getBalance(execution.instrument);
            if (balance < execution.positionSize) {
              let info = await getBinanceInstrumentsInfo(execution.instrument);
              //Change position size as we don't have the initial ammount to sell because of the commision
              execution.positionSize = binance.roundStep(qty - commision, info.stepSize);
              await updateExecutionDb(execution);
            }
          }
          if (qty !== 0) {
            resolve([
              Number.parseFloat((sum / qty).toFixed(8)),
              qty
            ]);
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      })
    });
  });
}

function marketBuy(execution, execDetails) {
  return new Promise((resolve, reject) => {
    binanceRealTrading.useServerTime(function() {
      binanceRealTrading.marketBuy(execution.instrument, execution.positionSize, async (error, response) => {
        if (error !== null) {
          execDetails.paused = true;
          executionError(execution, 'Error buying ' + execution.positionSize + ' ' + execution.instrument + '.<br>Error message from Binance: ' + JSON.parse(error.body).msg);
          resolve(false);
        } else {
          let tradePrice = await getOrderTradePrice(execution, response.orderId, 'buy');
          let trade = {
            'openDate': new Date(),
            'entry': tradePrice[0],
            'result': 0,
            'resultMoney': 0
          };
          execution.trades.push(trade);
          await updateExecutionDb(execution);
          $('#executedTrades' + execution.id).html(execution.trades.length);
          $('#openTrade' + execution.id).html('<i class="fa fa-check"></i>');
          resolve(true);
        }
      });
    });
  });
}

async function marketSell(execution, execDetails) {
  await cancelOrder(execution.instrument, execution.takeProfitOrderId);
  let takeProfitExecutedQty = await checkTakeProfitExecuted(execution, execDetails);
  if (takeProfitExecutedQty === execution.positionSize) {
    return;
  }
  let positionSize = execution.positionSize - takeProfitExecutedQty;

  return new Promise((resolve, reject) => {
    binanceRealTrading.useServerTime(function() {
      binanceRealTrading.marketSell(execution.instrument, positionSize, async (error, response) => {
        try {
          if (error !== null) {
            execDetails.paused = true;
            executionError(execution, 'Error selling ' + positionSize + ' ' + execution.instrument + '.<br>Error message from Binance: ' + JSON.parse(error.body).msg);
            resolve(false);
          } else {
            let tradePrice = await getOrderTradePrice(execution, response.orderId, 'sell');
            let finalPrice = tradePrice[0];
            if (takeProfitExecutedQty !== 0) {
              let takeProfitPrice = await getOrderTradePrice(execution, execution.takeProfitOrderId, 'sell');
              finalPrice = ((takeProfitPrice[0] * takeProfitPrice[1]) + (tradePrice[0] * tradePrice[1])) / execution.positionSize;
            }
            let tradeIndex = execution.trades.length - 1;
            execution.trades[tradeIndex]['closeDate'] = new Date();
            execution.trades[tradeIndex]['exit'] = finalPrice;
            execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - (execution.feeRate * 2);
            execution.trades[tradeIndex]['resultMoney'] = (execution.trades[tradeIndex]['result'] / 100) * (execution.positionSize * finalPrice);
            execution.takeProfitOrderId = null;
            await updateExecutionDb(execution);
            fillExecResInTable(execution.trades, execution.id);
            $('#openTrade' + execution.id).html('');
            await checkMaxLossReached(execution.id);
            fillBinanceBalances();
            resolve(true);
          }
        } catch (err) {
          executionError(execution, 'Error selling ' + positionSize + ' ' + execution.instrument + '.<br>Error message: ' + err.stack);
        }
      })
    });
  });
}

function placeTakeProfitLimit(execution, execDetails) {
  return new Promise(async (resolve, reject) => {
    let info = await getBinanceInstrumentsInfo(execution.instrument);
    let price = Number.parseFloat(execDetails.target.toFixed(info.precision));
    binanceRealTrading.useServerTime(function() {
      binanceRealTrading.sell(execution.instrument, execution.positionSize, price, {
        type: "LIMIT"
      }, (error, response) => {
        if (error) {
          execDetails.paused = true;
          executionError(execution, 'Error placing TAKE_PROFIT_LIMIT order for instrument ' + execution.instrument + '<br>Please take in mind that the strategy has bought and hasn\'t sell. You should manually sell on Binance the ammount or place the limit take profit order.<br>Error message from Binance: ' + JSON.parse(error.body).msg);
          resolve(null);
          return;
        }
        resolve(response.orderId);
      });
    });
  });
}

async function checkTakeProfitExecuted(execution, execDetails) {
  if (execution.type !== 'Trading' || execution.takeProfitOrderId === null) {
    return 0;
  }
  let priceAndQty = await getOrderTradePrice(execution, execution.takeProfitOrderId, 'sell');
  if (priceAndQty === null || priceAndQty[1] == null) {
    return 0;
  }
  if (priceAndQty[1] == execution.positionSize) {
    execDetails.tradeType = 'buy';

    let tradeIndex = execution.trades.length - 1;
    execution.trades[tradeIndex]['closeDate'] = new Date();
    execution.trades[tradeIndex]['exit'] = priceAndQty[0];
    execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - (execution.feeRate * 2);
    execution.trades[tradeIndex]['resultMoney'] = (execution.trades[tradeIndex]['result'] / 100) * (execution.positionSize * priceAndQty[0]);
    execution.takeProfitOrderId = null;
    await updateExecutionDb(execution);
    fillExecResInTable(execution.trades, execution.id);
    $('#openTrade' + execution.id).html('');
    await checkMaxLossReached(execution.id);
  }
  fillBinanceBalances();
  return priceAndQty[1];
}

async function executionUpdate(data, execution, execDetails) {
  try {
    let {
      x: executionType,
      s: symbol,
      p: price,
      q: quantity,
      S: side,
      o: orderType,
      i: orderId,
      X: orderStatus
    } = data;
    if (orderId == execution.takeProfitOrderId) {
      await checkTakeProfitExecuted(execution, execDetails);
    }
  } catch (err) {
    executionError
  }
}

function balanceUpdate(data) {}

function cancelOrder(instrument, orderId) {
  if (orderId === null || orderId === undefined) {
    return;
  }
  return new Promise((resolve, reject) => {
    binanceRealTrading.useServerTime(function() {
      binanceRealTrading.cancel(instrument, orderId, (error, response, symbol) => {
        resolve(response);
      });
    });
  });
}

async function executionError(execution, msg, crashed) {
  if (crashed) {
    log('error', 'executionError', 'Binance websocket has crashed. You internet connection my be down!');
    await stopAllExecutions(true);
    sendConnectionLost();
    return;
  }
  let errorMsg = msg.replace(/[^a-z0-9]/gi, ' ') + '<br><br>The execution of the strategy was stopped!';
  stopStrategyExecution(execution.id, errorMsg);
  execution.error = errorMsg;
  await updateExecutionDb(execution);
  showErrorMsg(errorMsg, execution.id);
  log('error', 'executionError', errorMsg);
}

async function restartBinanceWebsocket(execution, binanceObj, restartTries) {
  delete runningEndpoint[getEndpointName(execution)];
  if (restartTries > 5) {
    executionError(execution, 'Connection to Binance lost. Check Binance website for maintenance and try executing your strategy later.');
    return;
  }
  let endpoints = binanceObj.websockets.subscriptions();
  for (let endpoint in endpoints) {
    if (endpoint.toLowerCase() === getEndpointName(execution)) {
      binanceObj.websockets.terminate(endpoint);
    }
  }
  await sleep(2000);
  runningEndpoint[getEndpointName(execution)] = execution.id;
  startBinanceWebsocket(execution, binanceObj, restartTries);

}

async function startBinanceWebsocket(execution, binanceObj, restartTries) {
  let execDetails = getExecutionDetails(execution);
  if (execution.type === 'Trading') {
    binanceObj.websockets.userData(balanceUpdate, function(data) {
      executionUpdate(data, execution, execDetails)
    });
  }

  let iterationCounter = 0;
  let endCounterTime = new Date();
  binanceObj.websockets.chart(execution.instrument, getShortTimeframe(execDetails.smallTf), async (symbol, interval, chart) => {
    if (execDetails.paused || runningEndpoint[getEndpointName(execution)] === undefined) {
      return;
    }
    try {
      await execDetails.mutex.lock();
      let lastDate = binanceObj.last(chart);
      if (chart[lastDate] === undefined) {
        execDetails.paused = true;
        restartTries++;
        restartBinanceWebsocket(execution, binanceObj, restartTries)
        return;
      }

      if (!execDetails.started) {
        execDetails.started = true;
        if (execution.type === 'Trading' && execDetails.tradeType === 'sell') {
          await checkTakeProfitExecuted(execution, execDetails);
        }
        setStatusAndActions(execution.id, 'Running');
      }

      $('#lastUpdatedExecution' + execution.id).html(formatDateNoYear(new Date()));

      let curCounterTime = new Date();
      if (curCounterTime < endCounterTime) {
        iterationCounter++;
      } else {
        endCounterTime = new Date();
        endCounterTime.setSeconds(endCounterTime.getSeconds() + 5);
        iterationCounter = 0;
      }
      if (iterationCounter > 500) {
        executionError(execution, 'Connection to Binance lost. Check Binance website for maintenance and try executing your strategy later.', true);
        return;
      }
      execDetails.closePrices[execDetails.smallTf] = [];
      Object.keys(chart).forEach(function(key) {
        try {
          let close = Number.parseFloat(chart[key].close);
          if (!isNaN(close)) {
            execDetails.closePrices[execDetails.smallTf].push(close);
          }
        } catch (err) {}
      });
      //Remove the last value as the current candle is not closed
      let curPrice = execDetails.closePrices[execDetails.smallTf].pop();

      //Get big timeframe if needed
      if (execDetails.smallTf !== execDetails.bigTf) {

        let dateNow = new Date();

        if (execDetails.bigTfEndDate === null || dateNow > execDetails.bigTfEndDate) {

          let bigTfTicks = await getBinanceTicks300(execution.instrument, getShortTimeframe(execDetails.bigTf));

          if (bigTfTicks === null || bigTfTicks === undefined || bigTfTicks.length === 0) {
            execDetails.paused = true;
            executionError(execution, 'Connection to Binance lost. Check Binance website for maintenance and try executing your strategy later.');
            return;
          }
          execDetails.closePrices[execDetails.bigTf] = [];
          for (let tick of bigTfTicks) {
            execDetails.bigTfEndDate = new Date(tick[6]);
            execDetails.closePrices[execDetails.bigTf].push(Number.parseFloat(tick[4]));
          }

          //Remove the last value as the current candle is not closed
          execDetails.closePrices[execDetails.bigTf].pop();
        }

      }

      if (lastDate !== execDetails.lastCheckedData) {
        //New candle, so check trading rules
        execDetails.lastCheckedData = lastDate;
        if (!execDetails.firstCande) {
          if (execution.type === 'Alerts') {
            if (execDetails.tradeType === 'buy') {
              if (!execDetails.buyRulesHaveOnlyBigTf || execDetails.bigTfEndDate !== execDetails.lastCheckedDataBigTf) {
                execDetails.lastCheckedDataBigTf = execDetails.bigTfEndDate;
                if (checkTradeRules(execution.strategy.buyRules, execDetails.closePrices)) {
                  execDetails.tradeType = 'sell';
                  let dateNow = new Date();
                  execution.trades.push({type: 'Buy', date: dateNow, entry: curPrice});
                  openModalInfo('BUY Alert!<br><div class="text-left">Strategy: ' + execution.name + '<br>Exchange: ' + execution.exchange + '<br>Instrument: ' + execution.instrument + '<br>Date: ' + formatDateFull(dateNow) + '<br>Entry Price: ' + curPrice);
                  sendEmail(execution, 'BUY', dateNow, curPrice);
                  await updateExecutionDb(execution);
                  $('#executedTrades' + execution.id).html(execution.trades.length);
                  $('#openTrade' + execution.id).html('<i class="fa fa-check"></i>');
                }
              }
            } else {
              if (checkTradeRules(execution.strategy.sellRules, execDetails.closePrices)) {
                execDetails.tradeType = 'buy';
                let dateNow = new Date();
                execution.trades.push({type: 'Sell', date: dateNow, entry: curPrice});
                await updateExecutionDb(execution);
                $('#executedTrades' + execution.id).html(execution.trades.length);
                $('#openTrade' + execution.id).html('');
                openModalInfo('SELL Alert!<br><div class="text-left">Strategy: ' + execution.name + '<br>Exchange: ' + execution.exchange + '<br>Instrument: ' + execution.instrument + '<br>Date: ' + formatDateFull(dateNow) + '<br>Entry Price: ' + curPrice);
                sendEmail(execution, 'SELL', dateNow, curPrice);
              }
            }
          } else {

            if (execDetails.tradeType === 'buy') {
              if (!execDetails.buyRulesHaveOnlyBigTf || execDetails.bigTfEndDate !== execDetails.lastCheckedDataBigTf) {
                execDetails.lastCheckedDataBigTf = execDetails.bigTfEndDate;
                if (checkTradeRules(execution.strategy.buyRules, execDetails.closePrices)) {
                  //Should buy at market
                  if (execution.type === 'Simulation') {
                    //Get current ASK price and use it as a trade entry.
                    for (let i = 0; i < 10; i++) {
                      //There may not be ASK price at the moment. Try 10 times to find one.
                      let bidAsk = await getBinanceBidAsk(execution.instrument);
                      if (isNaN(bidAsk[1])) {
                        await sleep(100);
                      } else {
                        curPrice = bidAsk[1];
                        break;
                      }
                    }
                    if (execution.strategy.stoploss !== null && !isNaN(execution.strategy.stoploss)) {
                      execDetails.stoploss = curPrice * (1 - (execution.strategy.stoploss / 100));
                    }
                    if (execution.strategy.trailingSl !== null && !isNaN(executon.strategy.trailingSl)) {
                      execDetails.trailingSlPriceUsed = curPrice;
                      execDetails.stoploss = execDetails.trailingSlPriceUsed * (1 - (execution.strategy.trailingSl / 100));
                      execution.trailingSlPriceUsed = execDetails.trailingSlPriceUsed;
                      await updateExecutionDb(execution);
                    }
                    if (execution.strategy.target !== null && !isNaN(execution.strategy.target)) {
                      execDetails.target = curPrice * (1 + (execution.strategy.target / 100));
                    }
                    let trade = {
                      'openDate': new Date(),
                      'entry': curPrice,
                      'result': 0,
                      'resultMoney': 0
                    };
                    execution.trades.push(trade);
                    if (execution.strategy.timeClose !== null && !isNaN(execution.strategy.timeClose)) {
                      execDetails.timeClose = new Date(trade.openDate.getTime());
                      execDetails.timeClose.setHours(execDetails.timeClose.getHours() + execution.strategy.timeClose);
                    }
                    await updateExecutionDb(execution);
                    $('#executedTrades' + execution.id).html(execution.trades.length);
                    $('#openTrade' + execution.id).html('<i class="fa fa-check"></i>');
                  } else {
                    //Real trading - market buy
                    let marketBuyOk = await marketBuy(execution, execDetails);
                    if (!marketBuyOk) {
                      return;
                    }
                    if (execution.strategy.stoploss !== null && !isNaN(execution.strategy.stoploss)) {
                      execution.stoploss = execution.trades[execution.trades.length - 1].entry * (1 - (execution.strategy.stoploss / 100));
                    }
                    if (execution.strategy.trailingSl !== null && !isNaN(execution.strategy.trailingSl)) {
                      execDetails.trailingSlPriceUsed = execution.trades[execution.trades.length - 1].entry;
                      execDetails.stoploss = execDetails.trailingSlPriceUsed * (1 - (execution.strategy.trailingSl / 100));
                      execution.trailingSlPriceUsed = execDetails.trailingSlPriceUsed;
                      await updateExecutionDb(execution);
                    }
                    if (execution.strategy.target !== null && !isNaN(execution.strategy.target)) {
                      execDetails.target = execution.trades[execution.trades.length - 1].entry * (1 + (execution.strategy.target / 100));
                      execution.takeProfitOrderId = await placeTakeProfitLimit(execution, execDetails);
                      fillBinanceBalances();
                      if (execution.takeProfitOrderId === null) {
                        return;
                      }
                      await updateExecutionDb(execution);
                    }
                    if (execution.strategy.timeClose !== null && !isNaN(execution.strategy.timeClose)) {
                      execDetails.timeClose = new Date(execution.trades[execution.trades.length - 1].openDate.getTime());
                      execDetails.timeClose.setHours(execDetails.timeClose.getHours() + execution.strategy.timeClose);
                    }
                  } //Real trading - market buy
                  execDetails.tradeType = 'sell';
                  return;
                } //Check BigTF only contains buy rules  bigTfEndDate !== lastCheckedDataBigTf
              } //checkTradeRules - buyRules
            } else {
              // tradeType === 'sell'
              if (checkTradeRules(execution.strategy.sellRules, execDetails.closePrices)) {
                if (execution.type === 'Simulation') {
                  //Get current BID price and use it as a trade exit.
                  for (let i = 0; i < 10; i++) {
                    //There may not be BID price at the moment. Try 10 times to find one
                    let bidAsk = await getBinanceBidAsk(execution.instrument);
                    if (isNaN(bidAsk[0])) {
                      await sleep(100);
                    } else {
                      curPrice = bidAsk[0];
                      break;
                    }
                  }
                  let tradeIndex = execution.trades.length - 1;
                  execution.trades[tradeIndex]['closeDate'] = new Date();
                  execution.trades[tradeIndex]['exit'] = curPrice;
                  execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - (execution.feeRate * 2);
                  execution.trades[tradeIndex]['resultMoney'] = (execution.trades[tradeIndex]['result'] / 100) * (execution.positionSize * curPrice);
                  await updateExecutionDb(execution);
                  fillExecResInTable(execution.trades, execution.id);
                  $('#openTrade' + execution.id).html('');
                  await checkMaxLossReached(execution.id);
                } else {
                  await marketSell(execution, execDetails);
                }
                execDetails.tradeType = 'buy';
                return;
              } //checkTradeRules - sellRules
            } // tradeType === 'sell'
          } //Simulation and Real Trading
        } else {
          execDetails.firstCande = false;
        }
      } // if (lastDate !== lastCheckedData)

      //Same candle check only stoploss and target
      if (execDetails.tradeType === 'sell') {
        if (execution.type !== 'Alerts') {
          if (execution.strategy.trailingSl !== null && !isNaN(execution.strategy.trailingSl) && execDetails.trailingSlPriceUsed !== -1 && execDetails.trailingSlPriceUsed < curPrice) {
            execDetails.trailingSlPriceUsed = curPrice;
            execDetails.stoploss = execDetails.trailingSlPriceUsed * (1 - (execution.strategy.trailingSl / 100));
            execution.trailingSlPriceUsed = execDetails.trailingSlPriceUsed;
            await updateExecutionDb(execution);
          }
          //Get current BID price and use it as a trade exit.
          for (let i = 0; i < 10; i++) {
            //There may not be BID price at the moment. Try 10 times to find one
            let bidAsk = await getBinanceBidAsk(execution.instrument);
            if (isNaN(bidAsk[0])) {
              await sleep(100);
            } else {
              curPrice = bidAsk[0];
              break;
            }
          }
          if ((execDetails.stoploss !== null && execDetails.stoploss >= curPrice) || (execDetails.target !== null && execDetails.target <= curPrice) || (execDetails.timeClose !== null && execDetails.timeClose <= new Date())) {
            if (execution.type === 'Simulation') {
              let tradeIndex = execution.trades.length - 1;
              execution.trades[tradeIndex]['closeDate'] = new Date();
              execution.trades[tradeIndex]['exit'] = curPrice;
              execution.trades[tradeIndex]['result'] = (((execution.trades[tradeIndex].exit - execution.trades[tradeIndex].entry) / execution.trades[tradeIndex].entry) * 100) - (execution.feeRate * 2);
              execution.trades[tradeIndex]['resultMoney'] = (execution.trades[tradeIndex]['result'] / 100) * (execution.positionSize * curPrice);
              await updateExecutionDb(execution);
              fillExecResInTable(execution.trades, execution.id);
              $('#openTrade' + execution.id).html('');
              await checkMaxLossReached(execution.id);

              execDetails.tradeType = 'buy';
            }
          }
          if ((execDetails.stoploss !== null && execDetails.stoploss >= curPrice) || (execDetails.timeClose !== null && execDetails.timeClose <= new Date())) {
            if (execution.type === 'Trading') {
              await marketSell(execution, execDetails);
              execDetails.tradeType = 'buy';
            }
          }

        }

      }
    } catch (err) {
      execDetails.paused = true;
      executionError(execution, err.stack)
    } finally {
      execDetails.mutex.release();
    }

  });
  ///////////////////////////// END

}

function getExecutionDetails(execution) {
  let tradeType = 'buy';
  let stoploss = null;
  let target = null;
  let timeClose = null;
  if (execution.type == 'Alerts' && execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].type === 'Sell')) {
    tradeType = 'buy';
  }
  if (execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].exit === undefined || execution.trades[execution.trades.length - 1].exit === null)) {
    tradeType = 'sell';
    if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
      stoploss = execution.trades[execution.trades.length - 1].entry * (1 - (strategy.stoploss / 100));
    }
    if (strategy.trailingSl !== null && !isNaN(strategy.trailingSl)) {
      if (execution.trailingSlPriceUsed !== undefined && execution.trailingSlPriceUsed !== null) {
        stoploss = execution.trailingSlPriceUsed * (1 - (strategy.trailingSl / 100));
      } else {
        stoploss = execution.trades[execution.trades.length - 1].entry * (1 - (strategy.trailingSl / 100));
      }
    }
    if (strategy.target !== null && !isNaN(strategy.target)) {
      target = execution.trades[execution.trades.length - 1].entry * (1 + (strategy.target / 100));
    }
    if (strategy.timeClose !== null && !isNaN(strategy.timeClose)) {
      timeClose = new Date(execution.trades[execution.trades.length - 1].openDate.getTime());
      timeClose.setHours(timeClose.getHours() + strategy.timeClose);
    }
  }
  if (execution.type === 'Alerts' && execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].type === 'Sell')) {
    tradeType = 'buy';
  }
  let bigTf = execution.timeframes[0];
  let smallTf = execution.timeframes[execution.timeframes.length - 1];
  let bigTfEndDate = null;
  let closePrices = {};
  for (let ft of execution.timeframes) {
    closePrices[ft] = [];
  }

  let buyRulesHaveOnlyBigTf = true;
  for (let rule of execution.strategy.buyRules) {
    if (smallTf === rule.timeframe) {
      buyRulesHaveOnlyBigTf = false;
      break;
    }
  }

  return {
    tradeType: tradeType,
    stoploss: stoploss,
    target: target,
    timeClose: timeClose,
    bigTf: bigTf,
    smallTf: smallTf,
    buyRulesHaveOnlyBigTf: buyRulesHaveOnlyBigTf,
    bigTfEndDate: bigTfEndDate,
    closePrices: closePrices,
    paused: false,
    mutex: new Mutex(),
    started: false,
    lastCheckedData: -1,
    lastCheckedDataBigTf: -1,
    firstCande: true
  };
}
function showErrorMsg(msg, id) {
  openModalInfoBig('<h3 class="text-red text-center">ERROR</h3><div class="text-red">' + msg + '</div><br><div class="text-center"><a class="button alt white" title="Clear Error" href="#/" onclick="clearError(' + id + ')">Clear Error</a></div>')
}

async function rmExecutionFromTable(id) {
  let execution = await getExecutionById(id);
  openModalConfirm("Remove " + execution.name + " execution?", async function() {
    $('#executionTableItem' + id).remove();
    await sleep(100);
    await removeExecutionFromDb(id);
    let executions = await getExecutionsFromDb();
    if (executions.length == 0) {
      $('#tsResultDiv').hide();
    }
  });
}

async function stopStrategyExecution(id, errorMsg, dontWait) {
  setStatusAndActions(id, 'Stopping');
  let execution = await getExecutionById(id);
  delete runningEndpoint[getEndpointName(execution)];
  let binanceObj = (execution.type === 'Trading' && binanceRealTrading !== null)
    ? binanceRealTrading
    : binance;
  let endpoints = binanceObj.websockets.subscriptions();
  for (let endpoint in endpoints) {
    if (endpoint.toLowerCase() === getEndpointName(execution)) {
      //delete runningEndpoint[getEndpointName(execution)];
      binanceObj.websockets.terminate(endpoint);
    }
  }
  if (!dontWait) {
    await sleep(1000);
  }
  if (errorMsg !== null && errorMsg !== undefined) {
    setStatusAndActions(id, 'Error', errorMsg);
  } else {
    setStatusAndActions(id, 'Stopped');
  }
}

async function showExecutionResult(id) {

  let execution = await getExecutionById(id);
  $('#executionStrategiesTable').html('<thead><tr><td class="text-left">Trade</td><td>Open Date</td><td>Close Date</td><td>Open Price</td><td>Close Price</td><td>Result %</td><td>Result ' + getQuotedCurrency(execution.instrument) + '</td> </tr></thead>');
  if (execution.type === 'Alerts') {
    $('#executionDetailsLabel').html('Alerts');
    $('.trade-section').hide();
    $('#executionDetailsLabel2').hide();
    $('#executionTableLabel').hide();
    $('#executionPosSizeResDiv').hide();
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
        resultMoney += trade.resultMoney;
        $('#executionStrategiesTable').append('<tr><td class="text-left">' + count + '&nbsp;<i class="' + classes + '"></td><td>' + formatDateFull(trade.openDate) + '</td><td>' + formatDateFull(trade.closeDate) + '</td><td>' + trade.entry.toFixed(8) + '</td><td>' + trade.exit.toFixed(8) + '</td><td class="' + resultClass + '">' + trade.result.toFixed(2) + '</td><td class="' + resultClass + '">' + trade.resultMoney.toFixed(8) + '</td></tr>');
      } else {
        $('#executionStrategiesTable').append('<tr><td class="text-left">' + count + '</td><td>' + formatDateFull(trade.openDate) + '</td><td></td><td>' + trade.entry.toFixed(8) + '</td><td></td><td ></td><td ></td></tr>');
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
    $('#executionPosSizeResDiv').show();
    $('#executionPosSizeRes').html(execution.positionSize + ' ' + getBaseCurrency(execution.instrument));
    if (execution.maximumLoss != null && execution.maximumLoss != undefined) {
      $('#executionMaxLossResDiv').show();
      $('#executionMasLossRes').html(Math.abs(execution.maximumLoss) + ' ' + getQuotedCurrency(execution.instrument));
    } else {
      $('#executionMaxLossResDiv').hide();
    }
    fillUSDFields(resultMoney, execution.positionSize, execution.maximumLoss, execution.instrument);

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
}

async function fillUSDFields(resultMoney, posSize, maxLoss, instrument) {
  try {
    let prices = await getLastBinancePrices();
    let ustdValue = calculateUsdtValue(getQuotedCurrency(instrument), resultMoney, prices);
    if (ustdValue == null) {
      $('#executionResultWithUsd').html(resultMoney.toFixed(8) + '&nbsp;' + getQuotedCurrency(instrument));
      $('#executionPosSizeRes').html(posSize + '&nbsp;' + getBaseCurrency(instrument));
      $('#executionMasLossRes').html(Math.abs(maxLoss) + '&nbsp;' + getQuotedCurrency(instrument));
      return;
    }

    $('#executionResultWithUsd').html(resultMoney.toFixed(8) + '&nbsp;' + getQuotedCurrency(instrument) + ' (~ $' + ustdValue.toFixed(2) + ' )');
    let posSizeUsd = calculateUsdtValue(getBaseCurrency(instrument), posSize, prices);
    $('#executionPosSizeRes').html(posSize + '&nbsp;' + getBaseCurrency(instrument) + ' (~ $' + posSizeUsd.toFixed(2) + ' )');
    if (maxLoss !== null) {
      let maxLossUsd = calculateUsdtValue(getQuotedCurrency(instrument), Math.abs(maxLoss), prices);
      $('#executionMasLossRes').html(Math.abs(maxLoss) + '&nbsp;' + getQuotedCurrency(instrument) + ' (~ $' + maxLossUsd.toFixed(2) + ' )');
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
          if (trade.resultMoney === undefined && trade.exit != undefined && trade.exit != null) {
            trade.resultMoney = (trade.result / 100) * (execution.positionSize * trade.exit);
            isOldVersion = true;
          }
        }
        if (execution.maxLoss != null && execution.maxLoss != undefined && !isNaN(execution.maxLoss)) {
          let prices = await getLastBinancePrices();
          let curPrice = prices[execution.instrument];
          execution.maximumLoss = curPrice * execution.maxLoss;
          execution.maxLoss = null;
          delete execution.maxLoss;
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
        $('#tsStrategiesTable').append('<tr id="executionTableItem' + execution.id + '"><td>' + execution.type + '</td><td>' + execution.name + '</td><td>' + execution.exchange + '</td><td>' + execution.instrument + '</td><td class="text-center" id="executedTrades' + execution.id + '">' + execution.trades.length + '</td><td class="text-center" id="openTrade' + execution.id + '">' + openTrade + '</td><td><span id="executionRes' + execution.id + '"></span>&nbsp;' + '<a title="Detailed Results" href="#executionDetailsLabel" onclick="showExecutionResult(' + execution.id + ')"><i class="far fa-file-alt"></i></a>&nbsp;</td>' + '<td id="lastUpdatedExecution' + execution.id + '"></td><td id="statusStr' + execution.id + '"></td><td id="actionsBtns' + execution.id + '"></td></tr>');
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

function getExecutionById(id) {
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

const executionDbUpdateMutex = new Mutex();

async function updateExecutionDb(execution) {
  try {
    await executionDbUpdateMutex.lock();
    await removeExecutionFromDb(execution.id);
    await addExecutionToDb(execution);
    //getExecutionsDb().persistence.compactDatafile();
  } finally {
    executionDbUpdateMutex.release();
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
async function startAllSimulations(executions) {
  for (let execution of executions) {
    if (execution.error === null || execution.error === undefined) {
      if (execution.type != 'Trading') {
        if (runningEndpoint[getEndpointName(execution)] === execution.id) {
          continue;
        }
        let duplicated = await checkDuplicateInstrumetns(execution);
        if (!duplicated) {
          await runStrategy(execution.id);
        }
      }
    }
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
          for (let execution of executions) {
            if (execution.error === null || execution.error === undefined) {
              if (runningEndpoint[getEndpointName(execution)] === execution.id) {
                continue;
              }
              let duplicated = await checkDuplicateInstrumetns(execution);
              if (!duplicated) {
                await runStrategy(execution.id);
              }
            }
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
      await sleep(2000);
    }
  } finally {
    hideLoading();
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
    if (execution.maximumLoss !== null && execution.maximumLoss !== undefined && !isNaN(execution.maximumLoss)) {
      $('#executionMasLossEdit').val(Math.abs(execution.maximumLoss));
    } else {
      $('#executionMasLossEdit').val('');
    }
    $('#executionPosSizeEdit').val(execution.positionSize);
    $('#executionPosSizeEdit').val(execution.positionSize);

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

async function manualCloseOpenTrade(id) {
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
          openModalInfoBig("Cannot close trade Real Trading mode without connection to the exchange via your API Key and Secret!");
        }
      }, function() {
        openModalInfoBig("Cannot close trade in Real Trading mode without connection to the exchange via your API Key and Secret!");
      });
      return;
    } else {
      let execDetails = getExecutionDetails(execution);
      await marketSell(execution, execDetails)
    }

  }
}
async function saveEditExecutionWindow(id) {
  try {
    showLoading();
    let execution = await getExecutionById(id);
    if (execution.type === 'Alerts') {
      let email = $('#executionEmailEdit').val();
      if (email.indexOf('@') === -1) {
        email = null;
      }
      execution.email = email;
    } else {
      let positionSize = Number.parseFloat($('#executionPosSizeEdit').val());
      let posCheck = await checkPositionSize(positionSize, execution.exchange, execution.instrument);
      if (!posCheck[0]) {
        if (posCheck.length > 1) {
          $('#executionPosSizeEdit').val(posCheck[1])
        }
        return;
      }
      positionSize = posCheck[1];
      if (execution.positionSize !== positionSize && (execution.trades.length > 0 && (execution.trades[execution.trades.length - 1].exit == null || execution.trades[execution.trades.length - 1].exit == undefined))) {
        openModalInfoBig('<h3 class="text-center">Error</h3>Editing of the position size is forbidden while there is an open trade on the execution.<br>You need to click on the "Close Open Trade" button before changing the position size!');
        return;
      }
      execution.positionSize = positionSize;

      let maxLossTmp = Math.abs(Number.parseFloat($('#executionMasLossEdit').val()));

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
    await updateExecutionDb(execution);
    closeEditExecutionWindow();
  } finally {
    hideLoading();
  }
}

function editExecutionStrategy() {
  openModalInfoBig('<h3 class="text-center">This option is not implemented yet!</h3>Currently there is no way to edit an executing strategy. If you really need to do it, please, remove the execution, edit the strategy and execute it again. ')
}

function calculateUsdtValue(coin, total, prices) {
  if (prices[coin + 'BTC'] !== undefined) {
    return calculateUsdtValue('BTC', Number.parseFloat(prices[coin + 'BTC']) * total, prices)
  } else if (coin === 'USDT') {
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
  } else if (prices[coin + 'BNB'] !== undefined) {
    return calculateUsdtValue('BNB', Number.parseFloat(prices[coin + 'BNB']) * total, prices)
  } else if (coin == 'ETH') {
    return Number.parseFloat(prices['ETHUSDT']) * total;
  } else if (prices[coin + 'ETH'] !== undefined) {
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
      $('#binanceBalanceTable').html('');
      for (let row of totalBalances) {
        $('#binanceBalanceTable').append('<tr><td>' + row.coin + '</td><td>' + row.total + '</td><td>' + row.available + '</td><td>' + row.onOrder + '</td><td>' + row.usdt.toFixed(2) + '</td></tr>')
      }

    }
  } catch (err) {
    log('error', 'fillBinanceBalances', err.stack)
  } finally {
    balanceMutex.release();
  }
}
