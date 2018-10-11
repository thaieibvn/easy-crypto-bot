//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
var strategy = null;

function getStratetyDb() {
  if (strategy === null) {
    strategy = new Datastore({
      filename: getAppDataFolder() + '/db/strategy.db',
      autoload: true
    });
  }
  return strategy;
}
function getStrategies() {
  return new Promise((resolve, reject) => {
    getStratetyDb().find({}).sort({name: 1}).exec((error, strategies) => {
      if (error) {
        reject(error);
      } else {
        resolve(strategies);
      }
    })
  });
}

function getStrategyByName(name) {
  return new Promise((resolve, reject) => {
    getStratetyDb().findOne({
      name: name
    }, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    })
  });
}

function removeStrategy(name) {
  return new Promise((resolve, reject) => {
    getStratetyDb().remove({
      name: name
    }, function(error, numDeleted) {
      if (error) {
        reject(error);
      } else {
        resolve(numDeleted);
      }
    })
  });
}

function addStrategy(strategyToAdd) {
  return new Promise((resolve, reject) => {
    getStratetyDb().insert(strategyToAdd, (error, srt) => {
      if (error) {
        reject(error);
      } else {
        resolve(srt);
      }
    })
  });
}

let orgStrategyName = null;
let strategyDuplicated = false;
function parseRules(rules) {
  try {
    let rulesTmp = [];
    rules.each((index, rule) => {
      rulesTmp.push(rule);
    });
    let parsedRules = [];
    for (let rule of rulesTmp) {

      let indicator = rule.className.split('-')[1];
      let direction = $(rule).find('.direction').text();
      let period = Number.parseInt($(rule).find('.period').val());
      let period2 = Number.parseInt($(rule).find('.period2').val());
      let value = Number.parseFloat($(rule).find('.value').val());
      let crossDirection = $(rule).find('.cross-direction').text();

      let ruleItem = {};
      ruleItem.indicator = indicator;

      if (indicator === 'sma' || indicator === 'ema') {
        ruleItem.period = period;
        ruleItem.direction = direction;
        if (isNaN(period) || period < 1) {
          openModalInfo('Please fill all moving average fields with correct values!');
          return null;
        }

        if (direction === 'crossing') {
          ruleItem.crossDirection = crossDirection;
        } else {
          ruleItem.value = value;
          if (isNaN(value)) {
            openModalInfo('Please fill all moving average fields!');
            return null;
          }
        }
      } else if (indicator === 'cma') {
        ruleItem.period = period;
        ruleItem.period2 = period2;
        if (isNaN(period) || isNaN(period2) || period < 1 || period2 < 1) {
          openModalInfo('Please fill all moving average fields with correct values!');
          return null;
        }
        ruleItem.type = $(rule).find('.ma-type').text();
        ruleItem.type2 = $(rule).find('.ma-type2').text();
        ruleItem.crossDirection = crossDirection;
      } else if (indicator === 'rsi') {
        ruleItem.period = period;
        ruleItem.direction = direction;
        ruleItem.value = value;
        if (isNaN(period) || isNaN(value) || period < 1 || value < 0) {
          openModalInfo('Please fill all RSI fields with correct values!');
          return null;
        }
        if (direction === 'crossing') {
          ruleItem.crossDirection = crossDirection;
        }
      } else if (indicator === 'macd') {
        if (isNaN(period) || isNaN(period2) || period < 1 || period2 < 1) {
          openModalInfo('Please fill all MACD fields with correct values!');
          return null;
        }
        ruleItem.period = period;
        ruleItem.period2 = period2;
        if (period >= period2) {
          openModalInfo('The fast period of MADC rules should be lower than the slow period!');
          return null;
        }
        ruleItem.direction = direction;
        if (direction === 'crossing') {
          ruleItem.crossDirection = crossDirection;
        } else {
          ruleItem.value = value;
          if (isNaN(value)) {
            openModalInfo('Please fill all MACD fields with correct values!');
            return null;
          }
        }
        ruleItem.type = $(rule).find('.macd-line').text();
        if (ruleItem.type === 'signal line') {
          let period3 = Number.parseInt($(rule).find('.period3').val());
          if (isNaN(period3) || period3 < 1) {
            openModalInfo('Please fill all MACD fields with correct values!');
            return null;
          }
          ruleItem.period3 = period3;
        }
      }
      parsedRules.push(ruleItem);
    }
    return parsedRules;
  } catch (err) {
    openModalInfo('Please fill all fields!');
    return null;
  }
}

async function saveStrategy() {
  let strategyName = $('#strategyName').val().trim();
  if (strategyName.length === 0) {
    openModalInfo('Please type a name for the strategy!');
    return;
  }

  let buyRules = $('#buyRules>ul>li');
  if (buyRules.length === 0) {
    openModalInfo('Please add at least one BUY rule!');
    return;
  }
  let buyRulesList = parseRules(buyRules);
  if (buyRulesList === null) {
    return;
  }

  let sellRules = $('#sellRules>ul>li');
  if (sellRules.length === 0 && $('#target').val().trim().length <= 0) {
    openModalInfo('Please add at least one SELL rule or a Target!');
    return;
  }
  let sellRulesList = parseRules(sellRules);
  if (sellRulesList === null) {
    return;
  }

  let stoploss = Number.parseFloat($('#stoploss').val());
  if (!isNaN(stoploss) && stoploss < 0.2) {
    openModalInfo('The stoploss cannot be less than 0.2');
    return;
  }
  let target = Number.parseFloat($('#target').val());
  if (!isNaN(target) && target < 0.2) {
    openModalInfo('The target cannot be less than 0.2');
    return;
  }
  try {
    let strategy = {
      name: strategyName,
      buyRules: buyRulesList,
      sellRules: sellRulesList,
      stoploss: stoploss,
      target: target
    };

    let srtTmp = await getStrategyByName(strategy.name);
    if (srtTmp !== null && orgStrategyName === null) {
      openModalConfirm("Strategy with name " + strategy.name + " already exists.<br>Do you like to overwrite it?", function() {
        overwriteStrategy(strategy);
      });
      return;
    } else if (srtTmp !== null && orgStrategyName !== null && srtTmp.name !== orgStrategyName) {
      openModalConfirm("Strategy with name " + strategy.name + " already exists.<br>Do you like to overwrite it?", function() {
        if ($('#btStrategyCombobox').text() === orgStrategyName) {
          $('#btStrategyCombobox').text(strategy.name);
        }
        if ($('#tsStrategyCombobox').text() === orgStrategyName) {
          $('#tsStrategyCombobox').text(strategy.name);
        }
        if ($('#opStrategyCombobox').text() === orgStrategyName) {
          $('#opStrategyCombobox').text(strategy.name);
        }
        overwriteStrategy(strategy, orgStrategyName);
      });
      return;
    }
    if (orgStrategyName !== null) {

      if (!strategyDuplicated) {
        await removeStrategy(orgStrategyName);
      }
      if ($('#btStrategyCombobox').text() === orgStrategyName) {
        $('#btStrategyCombobox').text(strategy.name);
      }
      if ($('#tsStrategyCombobox').text() === orgStrategyName) {
        $('#tsStrategyCombobox').text(strategy.name);
      }
      if ($('#opStrategyCombobox').text() === orgStrategyName) {
        $('#opStrategyCombobox').text(strategy.name);
      }
    }

    await addStrategy(strategy);
    const strategies = await getStrategies();
    loadStrategies();
    loadStrategiesBt();
    closeNewStrategy();
  } catch (err) {
    //alert(err)
  }
}

async function overwriteStrategy(strategy, name) {
  if (!strategyDuplicated) {
    await removeStrategy(strategy.name);
  }
  if (name !== undefined) {
    await removeStrategy(name);
  }
  await addStrategy(strategy);
  loadStrategies();
  loadStrategiesBt();
  closeNewStrategy();
}

function addNewSmaRule(id, type) {
  $('#' + type + 'Rules>ul').append('<li class="' + type + '-sma" id="' + id + '">' + '<span class="bold">Rule:</span> Price is ' + '<div class="drop-down">' + '<a href="#/" onclick="dropDown(\'#' + id + '\')"><span class="name direction">above</span> <span ' + 'class="caret"></span></a>' + '<ul>' + '<li><a href="#/" onclick="dropDownItem(\'above\', \'#' + id + '\', function(){ $(\'#' + id + 'P\').show();$(\'#' + id + 'C\').hide()})">above</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'bellow\', \'#' + id + '\', function(){ $(\'#' + id + 'P\').show();$(\'#' + id + 'C\').hide()})">bellow</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'crossing\', \'#' + id + '\', function(){ $(\'#' + id + 'C\').show();$(\'#' + id + 'P\').hide()})">crossing</a></li>' + '</ul>' + '</div>' + '&nbsp;SMA with period <input class="period" type="number" value="20" /> ' + '<div id="' + id + 'P" class="inline"> by <input class="value" type="number" value="10" /> %</div>' + '<div id="' + id + 'C" class="inline" style="display:none;"> from ' + '<div class="drop-down">' + '<a href="#/" onclick="dropDown(\'#' + id + 'C\')"><span class="name cross-direction">bottom to top</span> <span ' + 'class="caret"></span></a>' + '<ul>' + '<li><a href="#/" onclick="dropDownItem(\'bottom to top\', \'#' + id + 'C\')">bottom to top</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'top to bottom\', \'#' + id + 'C\')">top to bottom</a></li>' + '</ul>' + '</div>' + '</div>' + '&nbsp;<a title="Info" onclick="smaInfo()" href="#/"><i class="text-blue fa fa-info-circle"></i></a>' + '&nbsp;<a title="Remove Rule" onclick="removeRule(\'#' + id + '\')" href="#/"><i class="text-red fas fa-times"></i></a>' + '</li>');
}

function addNewEmaRule(id, type) {
  $('#' + type + 'Rules>ul').append('<li class="' + type + '-ema" id="' + id + '">' + '<span class="bold">Rule:</span> Price is ' + '<div class="drop-down">' + '<a href="#/" onclick="dropDown(\'#' + id + '\')"><span class="name direction">above</span> <span ' + 'class="caret"></span></a>' + '<ul>' + '<li><a href="#/" onclick="dropDownItem(\'above\', \'#' + id + '\', function(){ $(\'#' + id + 'P\').show();$(\'#' + id + 'C\').hide()})">above</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'bellow\', \'#' + id + '\', function(){ $(\'#' + id + 'P\').show();$(\'#' + id + 'C\').hide()})">bellow</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'crossing\', \'#' + id + '\', function(){ $(\'#' + id + 'C\').show();$(\'#' + id + 'P\').hide()})">crossing</a></li>' + '</ul>' + '</div>' + '&nbsp;EMA with period <input class="period" type="number" value="20" /> ' + '<div id="' + id + 'P" class="inline"> by <input class="value" type="number" value="10" /> %</div>' + '<div id="' + id + 'C" class="inline" style="display:none;"> from ' + '<div class="drop-down">' + '<a href="#/" onclick="dropDown(\'#' + id + 'C\')"><span class="name cross-direction">bottom to top</span> <span ' + 'class="caret"></span></a>' + '<ul>' + '<li><a href="#/" onclick="dropDownItem(\'bottom to top\', \'#' + id + 'C\')">bottom to top</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'top to bottom\', \'#' + id + 'C\')">top to bottom</a></li>' + '</ul>' + '</div>' + '</div>' + '&nbsp;<a title="Info" onclick="emaInfo()" href="#/"><i class="text-blue fa fa-info-circle"></i></a>' + '&nbsp;<a title="Remove Rule" onclick="removeRule(\'#' + id + '\')" href="#/"><i class="text-red fas fa-times"></i></a>' + '</li>');
}

function addNewCmaRule(id, type) {
  $('#' + type + 'Rules>ul').append('<li class="' + type + '-cma" id="' + id + '">' + '<span class="bold">Rule:</span> <div id="' + id + 'T1" class="inline"><div class="drop-down"><a href="#/" onclick="dropDown(\'#' + id + 'T1\')"><span class="name ma-type">SMA</span> <span class="caret"></span></a><ul><li><a href="#/" onclick="dropDownItem(\'SMA\', \'#' + id + 'T1\')">SMA</a></li><li><a href="#/" onclick="dropDownItem(\'EMA\', \'#' + id + 'T1\')">EMA</a></li></ul></div></div> with period <input class="period" type="number" value="20"> is crossing <div id="' + id + 'T2" class="inline"><div class="drop-down"><a href="#/" onclick="dropDown(\'#' + id + 'T2\')"><span class="name ma-type2">SMA</span> <span class="caret"></span></a><ul><li><a href="#/" onclick="dropDownItem(\'SMA\', \'#' + id + 'T2\')">SMA</a></li><li><a href="#/" onclick="dropDownItem(\'EMA\', \'#' + id + 'T2\')">EMA</a></li></ul></div></div> with period <input class="period2" type="number" value="50" />' + '<div id="' + id + 'C" class="inline"> from ' + '<div class="drop-down">' + '<a href="#/" onclick="dropDown(\'#' + id + 'C\')"><span class="name cross-direction">bottom to top</span> <span ' + 'class="caret"></span></a>' + '<ul>' + '<li><a href="#/" onclick="dropDownItem(\'bottom to top\', \'#' + id + 'C\')">bottom to top</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'top to bottom\', \'#' + id + 'C\')">top to bottom</a></li>' + '</ul>' + '</div>' + '</div>' + '&nbsp;<a title="Info" onclick="cmaInfo()" href="#/"><i class="text-blue fa fa-info-circle"></i></a>' + '&nbsp;<a title="Remove Rule" onclick="removeRule(\'#' + id + '\')" href="#/"><i class="text-red fas fa-times"></i></a>' + '</li>');
}

function addNewRsiRule(id, type) {
  $('#' + type + 'Rules>ul').append('<li class="' + type + '-rsi" id="' + id + '">' + '<span class="bold">Rule:</span> RSI with period <input class="period" type="number" value="14" /> is&nbsp;' + '<div class="drop-down">' + '<a href="#/" onclick="dropDown(\'#' + id + '\')"><span class="name direction">above</span> <span ' + 'class="caret"></span></a>' + '<ul>' + '<li><a href="#/" onclick="dropDownItem(\'above\', \'#' + id + '\', function(){ $(\'#' + id + 'C\').hide()})">above</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'bellow\', \'#' + id + '\', function(){ $(\'#' + id + 'C\').hide()})">bellow</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'crossing\', \'#' + id + '\', function(){ $(\'#' + id + 'C\').show()})">crossing</a></li>' + '</ul>' + '</div>' + '<div class="inline">&nbsp;<input class="value" type="number" /></div>' + '<div id="' + id + 'C" class="inline" style="display:none;"> from ' + '<div class="drop-down">' + '<a href="#/" onclick="dropDown(\'#' + id + 'C\')"><span class="name cross-direction">bottom to top</span> <span ' + 'class="caret"></span></a>' + '<ul>' + '<li><a href="#/" onclick="dropDownItem(\'bottom to top\', \'#' + id + 'C\')">bottom to top</a></li>' + '<li><a href="#/" onclick="dropDownItem(\'top to bottom\', \'#' + id + 'C\')">top to bottom</a></li>' + '</ul>' + '</div>' + '</div>' + '&nbsp;<a title="Info" onclick="rsiInfo()" href="#/"><i class="text-blue fa fa-info-circle"></i></a>' + '&nbsp;<a title="Remove Rule" onclick="removeRule(\'#' + id + '\')" href="#/"><i class="text-red fas fa-times"></i></a>' + '</li>');
}

function addNewMacdRule(id, type) {
  $('#' + type + 'Rules>ul').append('<li class="' + type + '-macd" id="' + id + '"><span class="bold">Rule:</span> MACD, using "fast" period <input class="period" type="number" value="12" /> and "slow" period <input class="period2" type="number" value="26"/>,&nbsp;is&nbsp;<div class="drop-down"><a href="#/" onclick="dropDown(\'#' + id + '\')"><span class="name direction">above</span> <span class="caret"></span></a><ul><li><a href="#/" onclick="dropDownItem(\'above\', \'#' + id + '\', function(){ $(\'#' + id + 'P\').show();$(\'#' + id + 'C\').hide()})">above</a></li><li><a href="#/" onclick="dropDownItem(\'bellow\', \'#' + id + '\', function(){ $(\'#' + id + 'P\').show();$(\'#' + id + 'C\').hide()})">bellow</a></li><li><a href="#/" onclick="dropDownItem(\'crossing\', \'#' + id + '\', function(){ $(\'#' + id + 'P\').hide();$(\'#' + id + 'C\').show()})">crossing</a></li></ul></div>&nbsp;<div id="' + id + 'Line" class="inline"><div class="drop-down"><a href="#/" onclick="dropDown(\'#' + id + 'Line\')"><span class="name macd-line">signal line</span> <span class="caret"></span></a><ul><li><a href="#/" onclick="dropDownItem(\'signal line\', \'#' + id + 'Line\', function(){$(\'#' + id + 'SL\').show()})">signal line</a></li><li><a href="#/" onclick="dropDownItem(\'zero\', \'#' + id + 'Line\',function(){$(\'#' + id + 'SL\').hide()})">zero</a></li></ul></div></div><div id="' + id + 'SL" class="inline">&nbsp;with period <input class="period3" type="number" value="9"/> <div id="' + id + 'P" class="inline"> by <input class="value" type="number" value="1" /> %</div></div><div id="' + id + 'C" class="inline" style="display:none;"> from <div class="drop-down"><a href="#/" onclick="dropDown(\'#' + id + 'C\')"><span class="name cross-direction">bottom to top</span> <span class="caret"></span></a><ul><li><a href="#/" onclick="dropDownItem(\'bottom to top\', \'#' + id + 'C\')">bottom to top</a></li><li><a href="#/" onclick="dropDownItem(\'top to bottom\', \'#' + id + 'C\')">top to bottom</a></li></ul></div></div>&nbsp;<a title="Info" onclick="macdInfo()" href="#/"><i class="text-blue fa fa-info-circle"></i></a>&nbsp;<a title="Remove Rule" onclick="removeRule(\'#' + id + '\')" href="#/"><i class="text-red fas fa-times"></i></a></li>');
}
function macdInfo() {
  openModalInfoBig("<div style=\"display:inline-block;width:40%;margin:0 5%\">MACD, short for Moving Average Convergence/Divergence, is a trend-following momentum indicator.The MACD is the difference between a \"fast\" (short period) exponential moving average (EMA), and a \"slow\" (longer period) EMA. An EMA of the MACD that is called \"signal line\" is plotted on top of the MACD.<br><br>Signal Line Crossovers<br>Signal line crossovers are the most common MACD signals. A BUY signal is when MACD turns up and crosses above the signal line.<br><br>Center Line Crossovers<br>Center line crossovers are the next most common MACD signals. A bullish signal is generated when when the MACD Line moves above the zero line to turn positive.</div><img style=\"display:inline-block;width:40%;margin:0 5%;vertical-align:top;\" src=\"./assets/images/macd-info.png\" alt=\"\">");
}

function smaInfo() {
  openModalInfoBig("<div style=\"display:inline-block;width:40%;margin:0 5%\">The moving averages provide an easy way to determine the trend. It is easy to gauge the general direction and see whether a pair is trending up, trending down, or just ranging. When price action tends to stay above the moving average, it signals that price is in a general UPTREN and vise versa.<br><br>" + "A Simple Moving Average is calculated by adding up the last X period's closing prices and then dividing that number by X." + "<br><br>If you have a SMA with period 10 using daily chart, you would add up the closing prices for the last 10 days, and then divide that number by 10." + "<br><br>You can read on various strategies that use SMA in internet.</div><img style=\"display:inline-block;width:40%;margin:0 5%;vertical-align:top;\" src=\"./assets/images/sma-info.png\" alt=\"\">");
}

function emaInfo() {
  openModalInfoBig("<div style=\"display:inline-block;width:40%;margin:0 5%\">Exponential moving averages work like Simple Moving Averages, but reduce the lag by applying more weight to recent prices. " + "<br><br>The weighting applied to the most recent price depends on the number of periods in the moving average. EMAs differ from simple moving averages in that a given day's EMA calculation depends on the EMA calculations for all the days prior to that day." + "<br><br>You can read on various strategies that use EMA in internet.</div><img style=\"display:inline-block;width:40%;margin:0 5%;vertical-align:top;\" src=\"./assets/images/ema-info.png\" alt=\"\">");
}

function cmaInfo() {
  openModalInfoBig("<div style=\"display:inline-block;width:40%;margin:0 5%\">A Crossover occurs when a short-term average crosses through a long-term average." + "<br><br>This signal is used by traders to identify that momentum is shifting in one direction and that a strong move is likely approaching." + "<br><br>A buy signal is generated when the short-term average crosses above the long-term average, while a sell signal is triggered by a short-term average crossing below a long-term average." + "</div><img style=\"display:inline-block;width:40%;margin:0 5%;vertical-align:top;\" src=\"./assets/images/cma-info.png\" alt=\"\">");
}

function rsiInfo() {
  openModalInfoBig("<div style=\"display:inline-block;width:40%;margin:0 5%\">Relative Strength Index - RSI is a momentum indicator which provides a relative evaluation of the strength of the recent price performance." + " RSI values range from 0 to 100. " + "<br><br>A RSI reading of 70 or above is commonly interpreted as indicating an overbought or overvalued condition that may signal a trend change or corrective price reversal to the downside." + "<br><br>A RSI reading of 30 or below is commonly interpreted as indicating an oversold or undervalued condition that may signal a trend change or corrective price reversal to the upside." + "</div><img style=\"display:inline-block;width:40%;margin:0 5%;vertical-align:top;\" src=\"./assets/images/rsi-info.png\" alt=\"\">");
}

function indicatorCommingSoon(name) {
  openModalInfo(name + " is comming soon!");
}

let ruleCount = 1;
let buyRuleType = 'sma';
let sellRuleType = 'sma';

function newBuyRule() {
  let id = "rule" + ruleCount;
  newRule(id, buyRuleType, 'buy');
  ruleCount++;
  return id;
}

function newSellRule() {
  let id = "rule" + ruleCount;
  newRule(id, sellRuleType, 'sell');
  ruleCount++;
  return id;
}

function newRule(id, type, direction) {
  if (type === 'sma') {
    addNewSmaRule(id, direction);
  } else if (type === 'ema') {
    addNewEmaRule(id, direction);
  } else if (type === 'cma') {
    addNewCmaRule(id, direction);
  } else if (type === 'rsi') {
    addNewRsiRule(id, direction);
  } else if (type === 'macd') {
    addNewMacdRule(id, direction);
  } else {
    indicatorCommingSoon(type)
  }
}

function removeRule(id) {
  openModalConfirm("Are you sure you want to remove this rule?", function() {
    $(id).remove();
  });
}

function closeNewStrategy() {
  $('#newStrategyWindow').hide();
  $('#strategiesBody').css('opacity', '1');
  $('#strategiesBody').css('pointer-events', 'auto');
  $('#sidebar').css('opacity', '1');
  $('#sidebar').css('pointer-events', 'auto');
  $('#btBody').css('opacity', '1');
  $('#btBody').css('pointer-events', 'auto');
  $('body').css('overflow-y', 'auto');
}

function newStrategy() {
  orgStrategyName = null;
  strategyDuplicated = false;
  clearStrategyFields();
  $('#duplicateStrategyBtn').hide();
  $('#newStrategyLabel').html('Create New Strategy');
  $('#newStrategyWindow').fadeIn();
  $('#strategiesBody').css('opacity', '0.5');
  $('#strategiesBody').css('pointer-events', 'none');
  $('#sidebar').css('opacity', '0.5');
  $('#sidebar').css('pointer-events', 'none');
  $('body').css('overflow', 'hidden');
};

function duplicateStrategy() {
  $('#newStrategyLabel').html('Duplicate Strategy');
  $('#strategyName').val($('#strategyName').val() + ' (1)');
  strategyDuplicated = true;
}

function openStrategyVariationStrategy(strategy) {
  orgStrategyName = null;
  strategyDuplicated = false;
  $('#newStrategyLabel').html('Save Strategy Variation');
  $('#duplicateStrategyBtn').hide();
  openStrategy(strategy)
}

function openStrategy(strategy) {
  try {
    clearStrategyFields();
    $('#newStrategyWindow').fadeIn();
    $('#btBody').css('opacity', '0.5');
    $('#btBody').css('pointer-events', 'none');
    $('#strategiesBody').css('opacity', '0.5');
    $('#strategiesBody').css('pointer-events', 'none');
    $('#sidebar').css('opacity', '0.5');
    $('#sidebar').css('pointer-events', 'none');
    $('body').css('overflow', 'hidden');

    $('#strategyName').val(strategy.name);
    $('#stoploss').val(strategy.stoploss);
    $('#target').val(strategy.target);

    let buyRuleTypeTmp = buyRuleType;
    strategy.buyRules.forEach(rule => {
      buyRuleType = rule.indicator;
      let id = '#' + newBuyRule();

      if (rule.indicator === 'sma' || rule.indicator === 'ema') {
        $(id).find('.period').val(rule.period);
        $(id).find('.direction').text(rule.direction);
        if (rule.direction === 'crossing') {
          $(id + 'C').show();
          $(id + 'P').hide();
          $(id).find('.cross-direction').text(rule.crossDirection);
        } else {
          $(id).find('.value').val(rule.value);
        }
      } else if (rule.indicator === 'cma') {
        $(id).find('.period').val(rule.period);
        $(id).find('.period2').val(rule.period2);
        $(id).find('.ma-type').text(rule.type);
        $(id).find('.ma-type2').text(rule.type2);
        $(id).find('.cross-direction').text(rule.crossDirection);
      } else if (rule.indicator === 'rsi') {
        $(id).find('.period').val(rule.period);
        $(id).find('.direction').text(rule.direction);
        $(id).find('.value').val(rule.value);
        if (rule.direction === 'crossing') {
          $(id + 'C').show();
          $(id + 'P').hide();
          $(id).find('.cross-direction').text(rule.crossDirection);
        }
      } else if (rule.indicator === 'macd') {
        $(id).find('.period').val(rule.period);
        $(id).find('.period2').val(rule.period2);
        $(id).find('.direction').text(rule.direction);
        $(id).find('.macd-line').text(rule.type);

        if (rule.type === 'signal line') {
          $(id).find('.period3').val(rule.period3);
        } else {
          $(id + 'SL').hide();
        }

        if (rule.direction === 'crossing') {
          $(id + 'C').show();
          $(id + 'P').hide();
          $(id).find('.cross-direction').text(rule.crossDirection);
        } else {
          $(id).find('.value').val(rule.value);
        }
      }
    });
    buyRuleType = buyRuleTypeTmp;

    let sellRuleTypeTmp = sellRuleType;
    strategy.sellRules.forEach(rule => {
      sellRuleType = rule.indicator;
      let id = '#' + newSellRule();

      if (rule.indicator === 'sma' || rule.indicator === 'ema') {
        $(id).find('.period').val(rule.period);
        $(id).find('.direction').text(rule.direction);
        if (rule.direction === 'crossing') {
          $(id + 'C').show();
          $(id + 'P').hide();
          $(id).find('.cross-direction').text(rule.crossDirection);
        } else {
          $(id).find('.value').val(rule.value);
        }
      } else if (rule.indicator === 'cma') {
        $(id).find('.period').val(rule.period);
        $(id).find('.period2').val(rule.period2);
        $(id).find('.ma-type').text(rule.type);
        $(id).find('.ma-type2').text(rule.type2);
        $(id).find('.cross-direction').text(rule.crossDirection);
      } else if (rule.indicator === 'rsi') {
        $(id).find('.period').val(rule.period);
        $(id).find('.direction').text(rule.direction);
        $(id).find('.value').val(rule.value);
        if (rule.direction === 'crossing') {
          $(id + 'C').show();
          $(id + 'P').hide();
          $(id).find('.cross-direction').text(rule.crossDirection);
        }
      } else if (rule.indicator === 'macd') {
        $(id).find('.period').val(rule.period);
        $(id).find('.period2').val(rule.period2);
        $(id).find('.direction').text(rule.direction);
        $(id).find('.macd-line').text(rule.type);

        if (rule.type === 'signal line') {
          $(id).find('.period3').val(rule.period3);
        } else {
          $(id + 'SL').hide();
        }

        if (rule.direction === 'crossing') {
          $(id + 'C').show();
          $(id + 'P').hide();
          $(id).find('.cross-direction').text(rule.crossDirection);
        } else {
          $(id).find('.value').val(rule.value);
        }
      }
    });
    sellRuleType = sellRuleTypeTmp;

  } catch (err) {}
}

async function editStrategy(name) {
  orgStrategyName = name;
  strategyDuplicated = false;
  $('#newStrategyLabel').html('Edit Strategy');
  $('#duplicateStrategyBtn').css('display', 'inline-block');
  const strategy = await getStrategyByName(name);
  openStrategy(strategy);
}

function clearStrategyFields() {
  $('#strategyName').val("");
  ruleCount = 1;
  buyRuleType = 'sma';
  sellRuleType = 'sma';
  $('#buyRules>ul').html('');
  $('#sellRules>ul').html('');
  $('#buyRulesCombobox').html('Sample Moving Average SMA');
  $('#sellRulesCombobox').html('Sample Moving Average SMA');
  $('#stoploss').val('2');
  $('#target').val('6');

}

function rmStrategy(name) {
  openModalConfirm("Are you sure you want to remove " + name + " strategy?", function() {
    rmStrategy2(name);
    if ($('#btStrategyCombobox').text() === name) {
      $('#btStrategyCombobox').text('Choose Strategy');
    }
    if ($('#tsStrategyCombobox').text() === name) {
      $('#tsStrategyCombobox').text('Choose Strategy');
    }
    if ($('#opStrategyCombobox').text() === name) {
      $('#opStrategyCombobox').text('Choose Strategy');
    }
  });
}

async function rmStrategy2(name) {
  try {
    const numDeleted = await removeStrategy(name);
    loadStrategies()
  } catch (err) {}
}

async function loadStrategies() {
  try {
    const strategies = await getStrategies();
    $('#strategiesTable').html('');
    strategies.forEach(function(d) {
      $('#strategiesTable').append('<tr><td>' + d.name + '<td><td><a title="Edit Strategy" href="#newStrategyLabel" onclick="editStrategy(\'' + d.name + '\')" ><i class="far fa-edit"></i></a><td><td><a title="Remove Strategy" href="#/" onclick="rmStrategy(\'' + d.name + '\')"><i class="fas fa-times"></i></a></td></tr>');
    });
  } catch (err) {
    console.log(err);
  }
}

async function fillDefaultStrategies() {
  try {
    const target = getAppDataFolder() + '/db/strategy.db';
    fs.exists(target, async function(targetExists) {
      if (!targetExists) {
        let strategies = [];

        strategies.push({
          'name': 'Example: Crossing Moving Averages',
          'buyRules': [
            {
              'indicator': 'cma',
              'period': 7,
              'period2': 20,
              'type': 'EMA',
              'type2': 'SMA',
              'crossDirection': 'bottom to top'
            }
          ],
          'sellRules': [
            {
              'indicator': 'cma',
              'period': 7,
              'period2': 20,
              'type': 'EMA',
              'type2': 'SMA',
              'crossDirection': 'top to bottom'
            }
          ],
          'stoploss': 2,
          'target': 6
        });
        strategies.push({
          'name': 'Example: EMA Bellow/Above',
          'buyRules': [
            {
              'indicator': 'ema',
              'period': 5,
              'direction': 'bellow',
              'value': 0.5
            }
          ],
          'sellRules': [
            {
              'indicator': 'ema',
              'period': 5,
              'direction': 'above',
              'value': 0.5
            }
          ],
          'stoploss': 2,
          'target': 6
        });

        strategies.push({
          'name': 'Example: RSI + Crossing MAs',
          'buyRules': [
            {
              'indicator': 'rsi',
              'period': 20,
              'direction': 'bellow',
              'value': 40
            }, {
              'indicator': 'cma',
              'period': 3,
              'period2': 10,
              'type': 'EMA',
              'type2': 'SMA',
              'crossDirection': 'bottom to top'
            }
          ],
          'sellRules': [
            {
              'indicator': 'rsi',
              'period': 20,
              'direction': 'above',
              'value': 60
            }, {
              'indicator': 'cma',
              'period': 3,
              'period2': 10,
              'type': 'EMA',
              'type2': 'SMA',
              'crossDirection': 'top to bottom'
            }
          ],
          'stoploss': 2,
          'target': 3
        });

        strategies.push({
          "name": "Example: 15m EOSETH",
          "buyRules": [
            {
              "indicator": "sma",
              "period": 30,
              "direction": "bellow",
              "value": 3
            }, {
              "indicator": "rsi",
              "period": 10,
              "direction": "above",
              "value": 10
            }
          ],
          "sellRules": [
            {
              "indicator": "sma",
              "period": 30,
              "direction": "above",
              "value": 2
            }
          ],
          "stoploss": 3,
          "target": 10
        });
        for (let strategyTmp of strategies) {
          await addStrategy(strategyTmp);
        }
      }
      loadStrategies();
    });
  } catch (err) {
    //alert(err)
  }
}
