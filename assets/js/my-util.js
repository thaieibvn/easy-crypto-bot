const Datastore = require('nedb');
const shell = require('electron').shell;
const {app, clipboard, remote} = require('electron');
const Highcharts = require('highcharts/highstock');
//require('highcharts/indicators/indicators')(Highcharts);
//require('highcharts/indicators/ema')(Highcharts);
//require('highcharts/indicators/rsi')(Highcharts);


var eulaDb = new Datastore({
  filename: getAppDataFolder() + '/db/eula.db',
  autoload: true
});

function getEula() {
  return new Promise((resolve, reject) => {
    eulaDb.findOne({}).exec((error, eula) => {
      if (error) {
        reject(error);
      } else {
        resolve(eula);
      }
    })
  });
}

function enablePowerSaveBlocker() {
  try {
    const id = remote.powerSaveBlocker.start("prevent-app-suspension");
  } catch (err) {}
}

function getAppDataFolder() {
  return (app || remote.app).getPath('userData');
}

function storeEula(eula) {
  return new Promise((resolve, reject) => {
    eulaDb.insert(eula, (error, srt) => {
      if (error) {
        reject(error);
      } else {
        resolve(srt);
      }
    })
  });
}
async function checkEulaAccepted() {
  try {
    let eula = await getEula();
    if (eula === null || eula === undefined || !eula.accepted) {
      openModalAcceptBig('By clicking on "Accept" below you are accepting the full Terms and Conditions of the EasyCryptoBot application, available at <span class="one-click-select" style="font-weight:bold"> https://easycryptobot.com/terms.html</span>.<br>' + 'Cryptocurrency trading involves risk, and is not suitable for all investors. ' + 'You are responsible for all the risks and financial resources that you are using for trading and you should carefully consider your investment objectives. ' + 'You are agreeing that you are using the EasyCryptoBot application at your own risk. ' + 'EasyCryptoBot and it\'s developers are not liable for any loss or damage resulting from the use of the application. ' + 'If you do not fully understand these risks and conditions or you are not agreeing with them you must NOT USE the Easy Crypto Bot.', function() {
        try {
          storeEula({'accepted': true});
        } catch (err) {
          openModalInfo("Cannot write in applicatin folder!<br>Please contact support@easycryptobot.com", function() {
            let w = remote.getCurrentWindow();
            w.close();
          });
        }
      }, function() {
        let w = remote.getCurrentWindow();
        w.close();
      });
    }
  } catch (err) {
    openModalInfo("Cannot run the application!<br>Please contact support@easycryptobot.com", function() {
      let w = remote.getCurrentWindow();
      w.close();
    });
  }
}

async function removeTmpFiles() {
  const fs = require('fs');
  const path = require('path');
  const directory = getAppDataFolder() + '/db/tmp';
  fs.readdir(directory, (err, files) => {
    if (err) {}
    for (const file of files) {
      fs.unlink(path.join(directory, file), err => {
        if (err) {}
      });
    }
  });
}

async function removeDbFile(name) {
  const fs = require('fs');
  const file = getAppDataFolder() + '/db/tmp/' + name;
  return new Promise((resolve, reject) => {
    fs.unlink(file, err => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    })
  });
}

function copyDonationAddress(type) {
  if (type === "btc") {
    clipboard.writeText('1QCEAmRtWSAYxxkUoKHrM7gajviQZnVs47');
    openModalInfo("Bitcoin address is copied to clipboard");
  } else if (type === "eth") {
    clipboard.writeText('0x07580a3C92bb176e76719D6C3403DBB719359065');
    openModalInfo("Ethereum address is copied to clipboard");
  }
};
function copyMail() {
  clipboard.writeText('support@easycryptobot.com');
  openModalInfo("Email address is copied to clipboard");
}
function facebookClick() {
  shell.openExternal('https://www.facebook.com/EasyCryptoBot');
}

function twitterClick() {
  shell.openExternal('https://twitter.com/EasyCryptoBot');
}

function dropDownItem(name, id, func) {
  $(id + '>div>a').toggleClass('expanded');
  $(id + '>div>ul').slideToggle('fast');
  $(id + '>div>a>.name').html(name);
  if (func !== "") {
    func();
  }
}

function dropDown(id) {
  $(id + '>div>a').toggleClass('expanded');
  $(id + '>div>ul').slideToggle('fast');
}

async function loadStrategiesBt() {
  try {
    const strategies = await getStrategies();
    $('#btStrategiesList').html("");
    $('#tsStrategiesList').html("");
    strategies.forEach(function(d) {
      $('#btStrategiesList').append('<li><a href="#/" class="min-width25" onclick="dropDownItem(\'' + d.name + '\', \'#btStrategy\')">' + d.name + '</a></li>');
      $('#tsStrategiesList').append('<li><a href="#/" class="min-width25" onclick="dropDownItem(\'' + d.name + '\', \'#tsStrategy\')">' + d.name + '</a></li>');
    });
  } catch (err) {
    console.log(err);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addZero(number) {
  if (number < 10) {
    return '0' + number;
  } else {
    return number;
  }
}
function formatDate(date) {
  if (!(date instanceof Date)) {
    return '';
  }
  var srt = date.getFullYear() + '-' + addZero(date.getMonth() + 1) + '-' + addZero(date.getDate()) + ' ' + addZero(date.getHours()) + ':' + addZero(date.getMinutes());
  return srt;
}
function formatDateFull(date) {
  if (!(date instanceof Date)) {
    return '';
  }
  var srt = date.getFullYear() + '-' + addZero(date.getMonth() + 1) + '-' + addZero(date.getDate()) + ' ' + addZero(date.getHours()) + ':' + addZero(date.getMinutes()) + ':' + addZero(date.getSeconds());
  return srt;
}

function getDbFileName2(exchange, instrument, timeframe, startTime, endTime) {
  return exchange + '-' + instrument + '-' + timeframe + '-' + startTime.getFullYear() + '' + addZero(startTime.getMonth() + 1) + '' + addZero(startTime.getDate()) + '-' + endTime.getFullYear() + '' + addZero(endTime.getMonth() + 1) + '' + addZero(endTime.getDate()) + '.db';
}

function getDbFileName(exchange, instrument, timeframe) {
  return exchange + '-' + instrument + '-' + timeframe + '.db';
}

function getTimeframe(value) {
  switch (value) {
    case '1 minute':
      return '1m';
    case '3 minutes':
      return '3m';
    case '5 minutes':
      return '5m';
    case '5 minutes':
      return '5m';
    case '15 minutes':
      return '15m';
    case '30 minutes':
      return '30m';
    case '1 hour':
      return '1h';
    case '2 hours':
      return '2h';
    case '4 hours':
      return '4h';
    case '6 hours':
      return '6h';
    case '12 hours':
      return '12h';
    case '1 day':
      return '1d';
  }
}

class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }

  lock() {
    return new Promise((resolve, reject) => {
      if (this.locked) {
        this.queue.push([resolve, reject]);
      } else {
        this.locked = true;
        resolve();
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const [resolve, reject] = this.queue.shift();
      resolve();
    } else {
      this.locked = false;
    }
  }
}
