//EasyCryptoBot Copyright (C) 2018 Stefan Hristov

async function btFillBinanceInstruments() {
  await getBinanceInstruments();
}

async function btInstrumentKeyup() {
  try {
    lastEndDateBacktest = null;
    lastEndDateBacktestFull = null;
    let search = $('#btInstrumentSearch').val().toLowerCase();
    $('#btInstrumentList>ul').html('');
    let instruments = null;
    if ($('#btExchangeCombobox').text() === 'Binance') {
      instruments = await getBinanceInstruments();
    } else {
      $('#btInstrumentSearch').val('');
      openModalInfo('Please Choose Exchange First!');
      return;
    }

    let lastKey = null;

    if (instruments !== null) {
      let instrumentsToAdd = '';
      Object.keys(instruments).forEach(function(key) {
        if (key.toLowerCase().indexOf(search) != -1) {
          lastKey = key.toLowerCase();
          instrumentsToAdd += '<li><a href="#/"  onclick="btFillInstrument(\'' + key + '\')">' + key + '</a></li>';
        }
      });
      if (lastKey !== null && lastKey !== search) {
        $('#btInstrumentList>ul').html(instrumentsToAdd);
        $('#btInstrument>div>ul').show()
      }

    }
  } catch (err) {}
}

function btFillInstrument(name) {
  $('#btInstrument>div>ul').hide();
  $('#btInstrumentSearch').val(name)
}

function fillBtTestPeriod() {
  if ($('#btFromDate').val().length > 0) {
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
    $('#btFromDate').val(startDateStr);

    let toDate = new Date();
    day = ("0" + toDate.getDate()).slice(-2);
    month = ("0" + (
    toDate.getMonth() + 1)).slice(-2);
    let toDateStr = toDate.getFullYear() + "-" + (
    month) + "-" + (
    day);
    $('#btToDate').val(toDateStr);

  } catch (err) {}
}

//Add additional 100 ticks to the start date in order to calculate RSIs and EMAs
function getStartDate(value, date) {
  let startDate = new Date(date.getTime());
  switch (value) {
    case '1 minute':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '3 minutes':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '5 minutes':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '15 minutes':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '30 minutes':
      startDate.setDate(startDate.getDate() - 2);
      break;
    case '1 hour':
      startDate.setDate(startDate.getDate() - 4);
      break;
    case '2 hours':
      startDate.setDate(startDate.getDate() - 8);
      break;
    case '4 hours':
      startDate.setDate(startDate.getDate() - 17);
      break;
    case '6 hours':
      startDate.setDate(startDate.getDate() - 25);
      break;
    case '12 hours':
      startDate.setDate(startDate.getDate() - 50);
      break;
    case '1 day':
      startDate.setDate(startDate.getDate() - 100);
      break;
  }
  return startDate;
}

async function editBtStrategy() {
  try {
    let strategyName = $('#btStrategyCombobox').text();
    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy to Edit!');
      $('#btStrategyCombobox').html('Choose Strategy');
      return;
    }
    editStrategy(strategyName);
  } catch (err) {}
}
let str = '';
function get1mData(startTime, timeframe, ticks1m, lastIndex) {
  let endDate = new Date(startTime.getTime());
  switch (timeframe) {
    case '3 minutes':
      endDate.setMinutes(endDate.getMinutes() + 3);
      break;
    case '5 minutes':
      endDate.setMinutes(endDate.getMinutes() + 5);
      break;
    case '15 minutes':
      endDate.setMinutes(endDate.getMinutes() + 15);
      break;
    case '30 minutes':
      endDate.setMinutes(endDate.getMinutes() + 30);
      break;
    case '1 hour':
      endDate.setHours(endDate.getHours() + 1);
      break;
    case '2 hours':
      endDate.setHours(endDate.getHours() + 2);
      break;
    case '4 hours':
      endDate.setHours(endDate.getHours() + 4);
      break;
    case '6 hours':
      endDate.setHours(endDate.getHours() + 6);
      break;
    case '12 hours':
      endDate.setHours(endDate.getHours() + 12);
      break;
    case '1 day':
      endDate.setHours(endDate.getHours() + 24);
      break;
  }

  let result = [];
  for (; lastIndex < ticks1m.length; lastIndex++) {

    if (startTime <= ticks1m[lastIndex].d && ticks1m[lastIndex].d < endDate) {

      let closePrice = ticks1m[lastIndex].c;
      let openPrice = ticks1m[lastIndex].o;
      let highPrice = ticks1m[lastIndex].h;
      let lowPrice = ticks1m[lastIndex].l;

      let checkIndex = 2;
      let cancleSize = (highPrice - lowPrice) / lowPrice;
      if (cancleSize <= 0.001) {
        checkIndex = 2;
      } else if (cancleSize <= 0.003) {
        checkIndex = 4;
      } else if (cancleSize <= 0.005) {
        checkIndex = 6;
      } else if (cancleSize <= 0.01) {
        checkIndex = 10;
      }
      if (openPrice >= closePrice) {
        let priceTick = (highPrice - openPrice) / checkIndex;
        let priceTmp = openPrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp += priceTick;
        }
        priceTmp = highPrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp -= priceTick;
        }

        priceTick = (openPrice - closePrice) / checkIndex;
        priceTmp = openPrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp -= priceTick;
        }

        priceTick = (closePrice - lowPrice) / checkIndex;
        priceTmp = closePrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp -= priceTick;
        }
        priceTmp = lowPrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp += priceTick;
        }
        result.push([
          ticks1m[lastIndex].d,
          closePrice,
          highPrice,
          lowPrice
        ]);

      } else {
        let priceTick = (openPrice - lowPrice) / checkIndex;
        let priceTmp = openPrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp -= priceTick;
        }
        priceTmp = lowPrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp += priceTick;
        }

        priceTick = (closePrice - openPrice) / checkIndex;
        priceTmp = openPrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp += priceTick;
        }

        priceTick = (highPrice - closePrice) / checkIndex;
        priceTmp = closePrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp += priceTick;
        }
        priceTmp = highPrice;
        for (let i = 0; i < checkIndex - 1; i++) {
          result.push([
            ticks1m[lastIndex].d,
            priceTmp,
            highPrice,
            lowPrice
          ]);
          priceTmp -= priceTick;
        }
        result.push([
          ticks1m[lastIndex].d,
          closePrice,
          highPrice,
          lowPrice
        ]);
      }
    }
    if (ticks1m[lastIndex].d >= endDate) {
      break;
    }
  }
  return [result, lastIndex];
}
let lastEndDateBacktest = null;
let lastEndDateBacktestFull = null;
async function runBacktest() {
  let feeRate = 0.1;
  let strategyName = $('#btStrategyCombobox').text();
  let exchange = $('#btExchangeCombobox').text();
  let instrument = $('#btInstrumentSearch').val().toUpperCase();
  let timeframe = $('#btTimeframeCombobox').text();
  let startDateStr = $('#btFromDate').val();
  let endDateStr = $('#btToDate').val();
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
  let now = new Date();
  now.setHours(now.getHours() - 1);
  if (lastEndDateBacktest !== null && lastEndDateBacktestFull !== null && lastEndDateBacktest.getTime() == endDate.getTime() && now <= lastEndDateBacktestFull) {
    endDate.setHours(lastEndDateBacktestFull.getHours(), lastEndDateBacktestFull.getMinutes(), lastEndDateBacktestFull.getSeconds(), lastEndDateBacktestFull.getMilliseconds());
  } else {
    lastEndDateBacktest = new Date(endDate.getTime());
    now = new Date();
    endDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    lastEndDateBacktestFull = new Date(endDate.getTime());
  }

  let endDateTmp = new Date(endDate.getTime());
  endDateTmp.setMonth(endDate.getMonth() - 3);
  endDateTmp.setDate(endDateTmp.getDate() - 1);
  if (startDate < endDateTmp) {
    openModalInfo('The maximum backtest period is 3 months. Please change the selected dates.');
    return;
  }

  if (startDate >= endDate) {
    openModalInfo('Start Date must be before End Date!');
    return;
  }

  try {
    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy!');
      $('#btStrategyCombobox').html('Choose Strategy');

      return;
    }

    $('#runBacktestBtn').addClass('disabled');
    $('#btRunPercent').html('Starting Backtest..');
    $('#btRunPercent2').hide();
    $('#btRunRocket').hide();
    $('#btRunning').show();
    $('#btResult').hide();
    $('#btResultNoTrades').hide();
    $('#btResultDiv').show();
    $('#btStrategiesTable').html('<tr><td>Trade</td><td>Open Date</td><td>Close Date</td><td>Open Price</td><td>Close Price</td><td>Result</td></tr>');
    let ticks = await getBinanceTicks(instrument, getTimeframe(timeframe), getStartDate(timeframe, startDate), endDate);
    let ticks1m = null;
    if (timeframe !== '1 minute') {
      ticks1m = await getBinanceTicks(instrument, '1m', startDate, endDate);
    }

    if (ticks === null || (timeframe !== '1 minute' && ticks1m === null)) {
      $('#runBacktestBtn').removeClass('disabled');
      $('#btRunning').hide();
      $('#btResult').hide();
      openModalInfo('Could not optain data from ' + exchange + ' for the given period. The period may be too long. Please try with smaller period or try later!');
      return;
    }
    $('#btRunPercent2').hide();
    $('#btRunPercent').html('Backtest Execution: 0%');
    $('#btRunRocket').show();
    let bidAsk = await getBinanceBidAsk(instrument);
    for (let i = 0; i < 10; i++) {
      if (isNaN(bidAsk[0]) || isNaN(bidAsk[1])) {
        //try once again after 0.5 sec
        await sleep(500);
        bidAsk = await getBinanceBidAsk(instrument);
      } else {
        break;
      }
    }

    let bidAskDiff = 0;
    if (!isNaN(bidAsk[0]) && !isNaN(bidAsk[1])) {
      bidAskDiff = bidAsk[1] - bidAsk[0];
    }

    let trades = [];
    let tradeType = 'buy';
    let stoploss = Number.MIN_VALUE;
    let target = Number.MAX_VALUE;
    let closePrices = [];

    if (timeframe !== '1 minute') {
      let lastIndex1m = 0;
      for (let i = 0; i < ticks.length; i++) {
        if (i > 100 && i % 100 === 0) {
          await sleep(0);
        }
        let closePrice = ticks[i].c;
        let curDate = ticks[i].d;
        if (curDate < startDate) {
          closePrices.push(closePrice);
          continue;
        }
        if (i > 100) {
          $('#btRunPercent').html('Backtest Execution: ' + (
          ((i - 100) / (ticks.length - 100)) * 100).toFixed(0) + '%');
        }
        let pricesToCheck = get1mData(curDate, timeframe, ticks1m, lastIndex1m);
        lastIndex1m = pricesToCheck[1];
        let priceToCheckIndex = 0;
        for (let priceToCkeckData of pricesToCheck[0]) {
          if (priceToCheckIndex > 500 && priceToCheckIndex % 500 === 0) {
            await sleep(0);
          }
          priceToCheckIndex++;
          let date = priceToCkeckData[0];
          if (tradeType === 'buy') {
            if (trades.length > 0 && curDate.getTime() === trades[trades.length - 1].closeDateOrg.getTime()) {
              break;
            }
            let priceToCkeck = (priceToCkeckData[1] + bidAskDiff) > priceToCkeckData[2]
              ? priceToCkeckData[2]
              : (priceToCkeckData[1] + bidAskDiff);
            if (checkTradeRules(strategy.buyRules, closePrices, priceToCkeck)) {
              let trade = {
                'openDate': date,
                'openDateOrg': curDate,
                'entry': priceToCkeck,
                'result': 0
              };
              if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
                stoploss = priceToCkeck * (1 - (strategy.stoploss / 100))
              }
              if (strategy.target !== null && !isNaN(strategy.target)) {
                target = priceToCkeck * (1 + (strategy.target / 100))
              }
              trades.push(trade);
              tradeType = 'sell'
              continue;
            }
          } else {
            if (stoploss >= priceToCkeckData[3]) {
              trades[trades.length - 1]['closeDate'] = date;
              trades[trades.length - 1]['closeDateOrg'] = curDate;
              trades[trades.length - 1]['exit'] = stoploss > priceToCkeckData[1]
                ? priceToCkeckData[1]
                : stoploss;
              trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
              tradeType = 'buy';
              continue;
            }
            if (target <= priceToCkeckData[2]) {
              trades[trades.length - 1]['closeDate'] = date;
              trades[trades.length - 1]['closeDateOrg'] = curDate;
              trades[trades.length - 1]['exit'] = target < priceToCkeckData[1]
                ? priceToCkeckData[1]
                : target;
              trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
              tradeType = 'buy';
              continue;
            }
            if (strategy.sellRules.length === 0) {
              continue;
            }
            let priceToCkeck = (priceToCkeckData[1] - bidAskDiff) < priceToCkeckData[3]
              ? priceToCkeckData[3]
              : (priceToCkeckData[1] - bidAskDiff);
            if (checkTradeRules(strategy.sellRules, closePrices, priceToCkeck)) {
              trades[trades.length - 1]['closeDate'] = date;
              trades[trades.length - 1]['closeDateOrg'] = curDate;
              trades[trades.length - 1]['exit'] = priceToCkeck;
              trades[trades.length - 1]['result'] = (((priceToCkeck - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
              tradeType = 'buy';
            }
          }
        }
        closePrices.push(closePrice);
      }
    } else {
      //TODO ugly copy-paste here - extract common code in separate method
      for (let i = 0; i < ticks.length; i++) {
        if (i > 100 && i % 100 === 0) {
          await sleep(0);
        }
        let closePrice = ticks[i].c;
        let openPrice = ticks[i].o;
        let highPrice = ticks[i].h;
        let lowPrice = ticks[i].l;

        let curDate = ticks[i].d
        if (curDate < startDate) {
          closePrices.push(closePrice);
          continue;
        }
        if (i > 100) {
          $('#btRunPercent').html('Backtest Execution: ' + (
          ((i - 100) / (ticks.length - 100)) * 100).toFixed(0) + '%');
        }
        let checkIndex = 2;
        let cancleSize = (highPrice - lowPrice) / lowPrice;
        if (cancleSize <= 0.001) {
          checkIndex = 2;
        } else if (cancleSize <= 0.003) {
          checkIndex = 4;
        } else if (cancleSize <= 0.005) {
          checkIndex = 6;
        } else if (cancleSize <= 0.01) {
          checkIndex = 10;
        }

        let pricesToCheck = [];

        if (openPrice >= closePrice) {
          let priceTick = (highPrice - openPrice) / checkIndex;
          let priceTmp = openPrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp += priceTick;
          }
          priceTmp = highPrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp -= priceTick;
          }

          priceTick = (openPrice - closePrice) / checkIndex;
          priceTmp = openPrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp -= priceTick;
          }

          priceTick = (closePrice - lowPrice) / checkIndex;
          priceTmp = closePrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp -= priceTick;
          }
          priceTmp = lowPrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp += priceTick;
          }
          pricesToCheck.push(closePrice);

        } else {
          let priceTick = (openPrice - lowPrice) / checkIndex;
          let priceTmp = openPrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp -= priceTick;
          }
          priceTmp = lowPrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp += priceTick;
          }

          priceTick = (closePrice - openPrice) / checkIndex;
          priceTmp = openPrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp += priceTick;
          }

          priceTick = (highPrice - closePrice) / checkIndex;
          priceTmp = closePrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp += priceTick;
          }
          priceTmp = highPrice;
          for (let i = 0; i < checkIndex - 1; i++) {
            pricesToCheck.push(priceTmp);
            priceTmp -= priceTick;
          }
          pricesToCheck.push(closePrice);
        }

        for (let priceToCkeck of pricesToCheck) {
          let date = ticks[i].d;
          if (tradeType === 'buy') {
            //Only one trade per candle for the given timeframe
            if (trades.length > 0 && date.getTime() === trades[trades.length - 1].closeDateOrg.getTime()) {
              break;
            }
            priceToCkeck = (priceToCkeck + bidAskDiff) > highPrice
              ? highPrice
              : (priceToCkeck + bidAskDiff);
            if (checkTradeRules(strategy.buyRules, closePrices, priceToCkeck)) {
              let trade = {
                'openDate': date,
                'openDateOrg': date,
                'entry': priceToCkeck,
                'result': 0
              };
              if (strategy.stoploss !== null && !isNaN(strategy.stoploss)) {
                stoploss = priceToCkeck * (1 - (strategy.stoploss / 100))
              }
              if (strategy.target !== null && !isNaN(strategy.target)) {
                target = priceToCkeck * (1 + (strategy.target / 100))
              }
              trades.push(trade);
              tradeType = 'sell'
              continue;
            }
          } else {
            if (stoploss >= lowPrice) {
              trades[trades.length - 1]['closeDate'] = date;
              trades[trades.length - 1]['closeDateOrg'] = date;
              trades[trades.length - 1]['exit'] = stoploss > openPrice
                ? openPrice
                : stoploss;
              trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
              tradeType = 'buy';
              continue;
            }
            if (target <= highPrice) {
              trades[trades.length - 1]['closeDate'] = date;
              trades[trades.length - 1]['closeDateOrg'] = date;
              trades[trades.length - 1]['exit'] = target < openPrice
                ? openPrice
                : target;
              trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
              tradeType = 'buy';
              continue;
            }
            if (strategy.sellRules.length === 0) {
              continue;
            }
            priceToCkeck = (priceToCkeck - bidAskDiff) < lowPrice
              ? lowPrice
              : (priceToCkeck - bidAskDiff);
            if (checkTradeRules(strategy.sellRules, closePrices, priceToCkeck)) {
              trades[trades.length - 1]['closeDate'] = date;
              trades[trades.length - 1]['closeDateOrg'] = date;
              trades[trades.length - 1]['exit'] = priceToCkeck;
              trades[trades.length - 1]['result'] = (((priceToCkeck - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
              tradeType = 'buy';
            }
          }
        }
        closePrices.push(closePrice);
      }
    }
    //END

    if (trades.length > 0 && tradeType === 'sell') {
      trades[trades.length - 1]['closeDate'] = ticks[ticks.length - 1].d
      trades[trades.length - 1]['closeDateOrg'] = ticks[ticks.length - 1].d
      trades[trades.length - 1]['exit'] = ticks[ticks.length - 1].c;
      trades[trades.length - 1]['result'] = (((trades[trades.length - 1]['exit'] - trades[trades.length - 1].entry) / trades[trades.length - 1].entry) * 100) - feeRate;
    }

    let totalReturn = 0;
    let winLossRatio = 0;
    let avgGainLossPerTrade = 0;
    let resultWithUSD = 0;
    let executedTrades = trades.length;

    let winningPercent = 0;
    let winnignCount = 0;
    let avgWinPerTrade = 0;
    let biggestGain = 0;

    let loosingPercent = 0;
    let loosingCount = 0;
    let avgLostPerTrade = 0;
    let biggestLost = 0;

    let count = 1;
    let prevIsLoosing = false;
    let drawdowns = [];
    let tmpDate = new Date();
    let userTimezoneOffset = tmpDate.getTimezoneOffset() * 60000;
    for (let trade of trades) {
      if (count > 500 && count % 500 === 0) {
        await sleep(0);
      }
      let classes = '';
      let resultClass = '';
      if (trade.result > 0) {
        prevIsLoosing = false;
        if (biggestGain < trade.result) {
          biggestGain = trade.result;
        }
        winnignCount++;
        avgWinPerTrade += trade.result;
        classes = 'text-green fas fa-thumbs-up';
        resultClass = 'text-green';
      } else if (trade.result < 0) {

        if (prevIsLoosing) {
          drawdowns[drawdowns.length - 1] = drawdowns[drawdowns.length - 1] + trade.result;
        } else {
          drawdowns.push(trade.result);
        }
        prevIsLoosing = true;

        if (biggestLost > trade.result) {
          biggestLost = trade.result;
        }
        loosingCount++;
        avgLostPerTrade += trade.result;
        classes = 'text-red fas fa-thumbs-down';
        resultClass = 'text-red';
      } else {
        prevIsLoosing = false;
      }
      totalReturn += trade.result;

      //let openDate = new Date(trade.openDate.getTime() + userTimezoneOffset);
      //let closeDate = new Date(trade.closeDate.getTime() + userTimezoneOffset);

      $('#btStrategiesTable').append('<tr><td>' + count + '&nbsp;<i class="' + classes + '"></td><td>' + formatDateFull(trade.openDate) + '</td><td>' + formatDateFull(trade.closeDate) + '</td><td>' + trade.entry.toFixed(8) + '</td><td>' + trade.exit.toFixed(8) + '</td><td class="' + resultClass + '">' + trade.result.toFixed(2) + '%</td></tr>');
      count++;
    }
    if (executedTrades > 0) {
      avgGainLossPerTrade = totalReturn / executedTrades;
      winningPercent = (winnignCount / executedTrades) * 100;
      loosingPercent = (loosingCount / executedTrades) * 100;
      resultWithUSD = 1000 * (1 + totalReturn / 100);
      drawBtResultsChart(startDate, ticks, trades, strategy, instrument, timeframe, 'btResultsChart');
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

    let maxDrawdown = 0;
    for (let i = 0; i < drawdowns.length; i++) {
      if (drawdowns[i] < maxDrawdown) {
        maxDrawdown = drawdowns[i];
      }
    }
    $('#btMaxDrawdown').html(maxDrawdown.toFixed(2) + '%');
    $('#btTotalReturn').html(totalReturn.toFixed(2) + '%');
    $('#btWinLoss').html(winLossRatio.toFixed(2));
    $('#btAvgWinLossPerTrade').html(avgGainLossPerTrade.toFixed(2) + '%');
    $('#btResultWithUsd').html(resultWithUSD.toFixed(2) + '$');
    $('#btExecutedTrades').html(executedTrades);

    $('#btWinningTradesP').html(winningPercent.toFixed(2) + '%');
    $('#btWinningCount').html(winnignCount);
    $('#btAvgGainPerWinning').html(avgWinPerTrade.toFixed(2) + '%');
    $('#btBiggestGain').html(biggestGain.toFixed(2) + '%');

    $('#btLoosingTradesP').html(loosingPercent.toFixed(2) + '%');
    $('#btLoosingCount').html(loosingCount);
    $('#btAvgLostPerWinning').html(avgLostPerTrade.toFixed(2) + '%');
    $('#btBiggestLost').html(biggestLost.toFixed(2) + '%');

    $('#btStrategyRes').html(strategyName);
    $('#btExchangeRes').html(exchange);
    $('#btInstrumentRes').html(instrument);
    $('#btTimeframeRes').html(timeframe);
    $('#btPeriodFromRes').html(startDateStr);
    $('#btPeriodToRes').html(endDateStr);
    $('#btRunPercent').html('Backtest Execution: 100%');
    await sleep(500);
    $('#runBacktestBtn').removeClass('disabled');
    $('#btRunning').hide();
    if (executedTrades > 0) {
      $('#btResult').show();
    } else {
      drawBtResultsChart(startDate, ticks, trades, strategy, instrument, timeframe, 'btResultsChartNoTrades');
      $('#btResult').hide();
      $('#btResultNoTrades').show();
    }
  } catch (err) {
    $('#btRunning').hide();
    $('#runBacktestBtn').removeClass('disabled');
    openModalInfo('Internal Error Occurred!<br>' + err);
  }
}

function containsIndicator(indicators, indicator) {
  for (let intTmp of indicators) {
    if (intTmp.type === indicator.type && intTmp.period === indicator.period) {
      return true;
    }
  }
  return false;
}

function getIndicatorsFromRules(indicators, rules) {
  for (let rule of rules) {
    let indTmp = null;
    let indTmp2 = null;
    if (rule.indicator === 'sma' || rule.indicator === 'ema' || rule.indicator === 'rsi') {
      indTmp = {
        type: rule.indicator,
        period: rule.period,
        data: []
      };

    } else if (rule.indicator === 'cma') {
      if (rule.type === "SMA") {
        indTmp = {
          type: 'sma',
          period: rule.period,
          data: []
        };
      } else {
        indTmp = {
          type: 'ema',
          period: rule.period,
          data: []
        };
      }
      if (rule.type2 === "SMA") {
        indTmp2 = {
          type: 'sma',
          period: rule.period2,
          data: []
        };
      } else {
        indTmp2 = {
          type: 'ema',
          period: rule.period2,
          data: []
        };
      }
    }
    if (indTmp !== null && !containsIndicator(indicators, indTmp)) {
      indicators.push(indTmp)
    }
    if (indTmp2 !== null && !containsIndicator(indicators, indTmp2)) {
      indicators.push(indTmp2)
    }
  }
}

function getBtChartButtons(timeframe) {
  switch (timeframe) {
    case '1 minute':
      return [
        {
          type: 'hour',
          count: 2,
          text: '2H'
        }, {
          type: 'hour',
          count: 4,
          text: '4H'
        }, {
          type: 'hour',
          count: 12,
          text: '12H'
        }, {
          type: 'day',
          count: 1,
          text: '1D'
        }
      ]
    case '3 minutes':
      return [
        {
          type: 'hour',
          count: 6,
          text: '6H'
        }, {
          type: 'hour',
          count: 12,
          text: '12H'
        }, {
          type: 'day',
          count: 1,
          text: '1D'
        }, {
          type: 'week',
          count: 1,
          text: '1W'
        }
      ]
    case '5 minutes':
      return [
        {
          type: 'hour',
          count: 12,
          text: '12H'
        }, {
          type: 'day',
          count: 1,
          text: '1D'
        }, {
          type: 'week',
          count: 1,
          text: '1W'
        }
      ]
    case '15 minutes':
    case '30 minutes':
      return [
        {
          type: 'day',
          count: 1,
          text: '1D'
        }, {
          type: 'week',
          count: 1,
          text: '1W'
        }, {
          type: 'month',
          count: 1,
          text: '1M'
        }
      ]
    case '1 hour':
    case '2 hours':
      return [
        {
          type: 'week',
          count: 1,
          text: '1W'
        }, {
          type: 'month',
          count: 1,
          text: '1M'
        }, {
          type: 'month',
          count: 3,
          text: '3M'
        }
      ]
    case '4 hours':
    case '6 hours':
      return [
        {
          type: 'month',
          count: 1,
          text: '1M'
        }, {
          type: 'month',
          count: 3,
          text: '3M'
        }, {
          type: 'all',
          text: 'All'
        }
      ]
    case '12 hours':
    case '1 day':
      return [
        {
          type: 'month',
          count: 3,
          text: '3M'
        }, {
          type: 'all',
          text: 'All'
        }
      ]
  }

}
function drawBtResultsChart(startDate, ticks, trades, strategy, instrument, timeframe, container) {
  try {
    let indicators = [];
    getIndicatorsFromRules(indicators, strategy.buyRules);
    getIndicatorsFromRules(indicators, strategy.sellRules);

    let data = [];
    let closePrices = []
    let dateTmp = new Date();
    let currentTimeZoneOffsetInHours = dateTmp.getTimezoneOffset() / 60;
    Highcharts.setOptions({
      time: {
        timezoneOffset: currentTimeZoneOffsetInHours * 60
      }
    });
    for (let tick of ticks) {
      if (tick.d < startDate) {
        closePrices.push(tick.c);
        continue;
      }

      for (let indicator of indicators) {
        let value = null;
        if (indicator.type === 'sma') {
          value = calculateSMA(indicator.period, closePrices, tick.c)
        } else if (indicator.type === 'ema') {
          value = calculateEMA(indicator.period, closePrices, tick.c)
        } else if (indicator.type === 'rsi') {
          value = calculateRsi(indicator.period, closePrices, tick.c)
        }
        if (value !== null && value[0] !== null) {
          indicator.data.push([
            tick.d.getTime(), value[0]
          ]);
        }
      }
      data.push([tick.d.getTime(), tick.o, tick.h, tick.l, tick.c]);
      closePrices.push(tick.c);
    }

    let openTrades = [];
    let closeTrades = [];
    let tradeCount = 1;
    for (let trade of trades) {
      openTrades.push({
        x: trade.openDateOrg.getTime(),
        y: trade.entry,
        title: 'Open Trade ' + tradeCount + '<br>Date: ' + formatDateFull(trade.openDate) + '<br>Price: ' + trade.entry.toFixed(8)
      });
      closeTrades.push({
        x: trade.closeDateOrg.getTime(),
        y: trade.exit,
        title: 'Close Trade ' + tradeCount + '<br>Date: ' + formatDateFull(trade.openDate) + '<br>Price: ' + trade.entry.toFixed(8) + '<br>Result: ' + trade.result.toFixed(2) + '%'
      });
      tradeCount++;
    }

    let series = [];
    series.push({
      id: 'main-series',
      type: 'candlestick',
      name: instrument + ' ' + timeframe,
      data: data,
      dataGrouping: {
        enabled: false
      }
    });
    series.push({
      type: 'scatter',
      name: 'Opened Trades',
      data: openTrades,
      marker: {
        enabled: true,
        symbol: 'triangle',
        radius: 7,
        fillColor: '#09c459'
      },
      dataGrouping: {
        enabled: false
      }
    });
    series.push({
      type: 'scatter',
      name: 'Closed Trades',
      data: closeTrades,
      marker: {
        enabled: true,
        symbol: 'triangle-down',
        radius: 7,
        fillColor: '#C0392B'
      },
      dataGrouping: {
        enabled: false
      }
    });

    let containsSecondAxisIndicators = false;
    for (let indicator of indicators) {
      if (indicator.type === 'rsi') {
        containsSecondAxisIndicators = true;
        series.push({
          name: indicator.type + ' ' + indicator.period,
          type: 'spline',
          yAxis: 1,
          dataGrouping: {
            enabled: false
          },
          data: indicator.data
        })
      } else {
        series.push({
          name: indicator.type + ' ' + indicator.period,
          type: 'spline',
          dataGrouping: {
            enabled: false
          },
          data: indicator.data
        })
      }
    }
    let yAxis = containsSecondAxisIndicators
      ? [
        {
          crosshair: false,
          height: '85%',
          startOnTick: false,
          endOnTick: false,
          resize: {
            enabled: true
          }
        }, {
          crosshair: false,
          height: '14%',
          top: '86%',
          startOnTick: false,
          endOnTick: false,
          resize: {
            enabled: true
          }
        }
      ]
      : {
        crosshair: false,
        startOnTick: false,
        endOnTick: false,
        resize: {
          enabled: true
        }
      };
    let buttons = getBtChartButtons(timeframe);
    let chart = Highcharts.stockChart(container, {
      rangeSelector: {
        buttons: buttons,
        selected: 0,
        inputEnabled: false
      },
      title: {
        text: instrument + ' ' + timeframe
      },
      xAxis: {
        crosshair: false
      },

      yAxis: yAxis,

      plotOptions: {
        scatter: {
          tooltip: {
            pointFormat: '{point.title}'
          }
        },
        series: {
          stickyTracking: false,
          showInLegend: true,
          gapSize: null,
          marker: {
            enabled: false
          }
        }
      },
      tooltip: {
        snap: 0
      },
      legend: {
        enabled: true
      },
      series: series
    });
  } catch (err) {
    //TODO
    alert(err)
  }
}
