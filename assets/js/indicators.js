//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
function checkTradeRules(rules, historicalData, lastPrice) {
  //try {
    if (rules === null || rules === undefined || rules.length === 0) {
      return false;
    }
    let rulesMet = 0;
    for (let rule of rules) {
      if (rule.indicator === 'sma' || rule.indicator === 'ema') {
        let ma = rule.indicator === 'sma'
          ? calculateSMA(rule.period, historicalData, lastPrice)
          : calculateEMA(rule.period, historicalData, lastPrice);
        if (ma === null) {
          continue;
        }
        if (rule.direction === 'above') {
          if (lastPrice >= ma[0] * (1 + (rule.value / 100))) {
            rulesMet++;
            continue;
          }
        } else if (rule.direction === 'bellow') {
          if (lastPrice <= ma[0] * (1 - (rule.value / 100))) {
            rulesMet++;
            continue;
          }
        } else if (rule.direction === 'crossing') {
          if (rule.crossDirection === 'top to bottom' && historicalData[historicalData.length - 1] > ma[1] && lastPrice <= ma[0]) {
            rulesMet++;
            continue;
          } else if (rule.crossDirection === 'bottom to top' && historicalData[historicalData.length - 1] < ma[1] && lastPrice >= ma[0]) {
            rulesMet++;
            continue;
          }
        }
      } else if (rule.indicator === "cma") {
        let ma1 = rule.type === "SMA"
          ? calculateSMA(rule.period, historicalData, lastPrice)
          : calculateEMA(rule.period, historicalData, lastPrice);
        let ma2 =  rule.type2 === "SMA"
          ? calculateSMA(rule.period2, historicalData, lastPrice)
          : calculateEMA(rule.period2, historicalData, lastPrice);
        if (ma1 === null || ma2 === null) {
          continue;
        }
        if (rule.crossDirection === 'top to bottom' && ma1[1] > ma2[1] && ma1[0] <= ma2[0]) {
          rulesMet++;
          continue;
        } else if (rule.crossDirection === 'bottom to top' && ma1[1] < ma2[1] && ma1[0] >= ma2[0]) {
          rulesMet++;
          continue;
        }
      } else if (rule.indicator === "rsi") {
        let rsi = calculateRsi(rule.period, historicalData, lastPrice);
        if (rsi === null) {
          continue;
        }
        if (rule.direction === 'above') {
          if (rsi[0] >= rule.value) {
            rulesMet++;
            continue;
          }
        } else if (rule.direction === 'bellow') {
          if (rsi[0] <= rule.value) {
            rulesMet++;
            continue;
          }
        } else if (rule.direction === 'crossing') {
          if (rule.crossDirection === 'top to bottom' && rsi[1] > rule.value && rsi[0] <= rule.value) {
            rulesMet++;
            continue;
          } else if (rule.crossDirection === 'bottom to top' && rsi[1] < rule.value && rsi[0] >= rule.value) {
            rulesMet++;
            continue;
          }
        }
      }
    }
    return rulesMet === rules.length;
//  } catch (err) {
    //alert(err);
//    return false;
//  }
}

function calculateSMA(smaPeriod, historicalData, lastPrice) {
  if (historicalData.length <= smaPeriod) {
    return null;
  }
  let sum = 0;
  for (let i = historicalData.length - smaPeriod + 1; i < historicalData.length; i++) {
    sum += historicalData[i]
  }
  return [
    (sum + lastPrice) / smaPeriod,
    (sum + historicalData[historicalData.length - smaPeriod]) / smaPeriod
  ];
}

function calculateEMA(emaPeriod, historicalData, lastPrice) {
  if (historicalData.length <= emaPeriod || historicalData.length < 100) {
    return null;
  }
  let multiplier = 2 / (emaPeriod + 1);
  let emaPrev = historicalData[historicalData.length - 100];
  for (let i = historicalData.length - 99; i < historicalData.length; i++) {
    emaPrev = (historicalData[i] - emaPrev) * multiplier + emaPrev;
  }
  let ema = (lastPrice - emaPrev) * multiplier + emaPrev;
  return [ema, emaPrev];
}

function calculateRs(period, array) {
  let multiplier = 1 / period;
  let ema = array[0];
  for (let i = 1; i < array.length; i++) {
    let closePrice = array[i];
    ema = (closePrice - ema) * multiplier + ema;
  }
  return ema;
}

function calculateRsi(rsiPeriod, historicalData, lastPrice) {
  if (historicalData.length <= rsiPeriod || historicalData.length < 100) {
    return null;
  }

  let avgGain = [];
  let avgLoss = [];
  let prevClose = historicalData[historicalData.length - 100];
  for (let i = historicalData.length - 99; i < historicalData.length; i++) {
    let change = historicalData[i] - prevClose;
    if (change > 0) {
      avgGain.push(change);
      avgLoss.push(0);
    } else if (change < 0) {
      avgGain.push(0);
      avgLoss.push(Math.abs(change));
    }
    prevClose = historicalData[i];
  }

  let avgGainFinalPrev = calculateRs(rsiPeriod, avgGain);
  let avgLossFinalPrev = calculateRs(rsiPeriod, avgLoss);

  let change = lastPrice - prevClose;
  if (change > 0) {
    avgGain.push(change);
    avgLoss.push(0);
  } else if (change < 0) {
    avgGain.push(0);
    avgLoss.push(Math.abs(change));
  }

  let avgGainFinal = calculateRs(rsiPeriod, avgGain);
  let avgLossFinal = calculateRs(rsiPeriod, avgLoss);

  let rsi = 100 - (100 / (1 + (avgGainFinal / avgLossFinal)));
  let rsiPrev = 100 - (100 / (1 + (avgGainFinalPrev / avgLossFinalPrev)));
  //let d = new Date(array[index][0])
  //alert(d + ' RSI: ' + rsi+' RSI: ' + rsiPrev);
  return [rsi, rsiPrev];
}

module.exports = {
  checkTradeRules: checkTradeRules,
  calculateSMA: calculateSMA,
  calculateEMA: calculateEMA,
  calculateRsi: calculateRsi
}
