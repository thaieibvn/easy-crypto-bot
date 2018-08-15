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
        break;
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
      let ma2 = rule.type2 === "SMA"
        ? calculateSMA(rule.period2, historicalData, lastPrice)
        : calculateEMA(rule.period2, historicalData, lastPrice);
      if (ma1 === null || ma2 === null) {
        break;
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
        break;
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
    } else if (rule.indicator === "macd") {
      let macd = calculateMacd(rule.period, rule.period2, rule.period3, historicalData, lastPrice);
      if (macd === null) {
        break;
      }
      let lineValue = 0;
      let lineValue2 = 0;
      let ruleValue = 0;
      if (rule.type === 'signal line') {
        if (macd[2] === null || macd[2].length < 2) {
          break;
        }
        lineValue = macd[2][macd[2].length - 1];
        lineValue2 = macd[2][macd[2].length - 2];
        ruleValue = rule.value;
      }

      if (rule.direction === 'above') {
        if (macd[0] >= lineValue * (1 + (ruleValue / 100))) {
          rulesMet++;
          continue;
        }
      } else if (rule.direction === 'bellow') {
        if (macd[0] <= lineValue * (1 - (ruleValue / 100))) {
          rulesMet++;
          continue;
        }
      } else if (rule.direction === 'crossing') {
        if (rule.crossDirection === 'top to bottom' && macd[1] > lineValue2 && macd[0] <= lineValue) {
          rulesMet++;
          continue;
        } else if (rule.crossDirection === 'bottom to top' && macd[1] < lineValue2 && macd[0] >= lineValue) {
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

function calculateEMAFull(emaPeriod, historicalData, lastPrice, count) {
  if (historicalData.length <= emaPeriod || historicalData.length < count) {
    return null;
  }
  let multiplier = 2 / (emaPeriod + 1);
  let emaPrev = historicalData[historicalData.length - count];
  let emas = [];
  for (let i = historicalData.length - count + 1; i < historicalData.length; i++) {
    emaPrev = (historicalData[i] - emaPrev) * multiplier + emaPrev;
    emas.push(emaPrev);
  }
  if (lastPrice !== null) {
    let ema = (lastPrice - emaPrev) * multiplier + emaPrev;
    emas.push(ema);
  }
  return emas;
}

function calculateMacd(period, period2, period3, historicalData, lastPrice) {
  let emasCount = period3 === undefined
    ? 100
    : period3 + 70;
  let fastEma = calculateEMAFull(period, historicalData, lastPrice, emasCount);
  let slowEma = calculateEMAFull(period2, historicalData, lastPrice, emasCount);
  if (fastEma === null || slowEma === null || fastEma.length < 1 || slowEma.length < 1) {
    return null;
  }
  let macd = [];

  let fastEmaIndex = fastEma.length - 1;
  let slowEmaIndex = slowEma.length - 1;
  for (let i = 0; i < emasCount; i++) {
    if (fastEmaIndex < 0 || slowEmaIndex < 0) {
      break;
    }
    macd.push(fastEma[fastEmaIndex] - slowEma[slowEmaIndex]);
    fastEmaIndex--;
    slowEmaIndex--;
  }
  macd = macd.reverse();
  let signal = null;
  if (period3 !== undefined) {
    signal = calculateEMAFull(period3, macd, null, 30);
  }

  return [
    macd[macd.length - 1],
    macd[macd.length - 2],
    signal
  ];
}
