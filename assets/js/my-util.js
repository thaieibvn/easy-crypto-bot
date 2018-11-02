const Datastore = require('nedb');
const shell = require('electron').shell;
const {app, BrowserWindow, clipboard, remote} = require('electron');
const Highcharts = require('highcharts/highstock');
//require('highcharts/indicators/indicators')(Highcharts);
//require('highcharts/indicators/ema')(Highcharts);
//require('highcharts/indicators/rsi')(Highcharts);
var fs = require('original-fs');
//const fs = require('fs');
const {ipcRenderer} = require("electron");
//remote.getCurrentWindow().toggleDevTools()
var eulaDb = new Datastore({
  filename: getAppDataFolder() + '/db/eula.db',
  autoload: true
});

let confirmOkFunc = null;
let confirmCalcelFunc = null;
let modalInfoFunc = null;

function openModalAccept(msg, okFunc, calcelFunc) {
  $('#modalConfirm').removeClass('modal-big');
  $('#modalConfirm').addClass('modal-small');
  $('#modalConfirmOk').html('Accept');
  openModalConfirmImpl(msg, okFunc, calcelFunc);
}

function openModalAcceptBig(msg, okFunc, calcelFunc) {
  $('#modalConfirm').removeClass('modal-small');
  $('#modalConfirm').addClass('modal-big');
  $('#modalConfirmOk').html('Accept');
  openModalConfirmImpl(msg, okFunc, calcelFunc);
}

function openModalConfirmBig(msg, okFunc, calcelFunc) {
  $('#modalConfirm').removeClass('modal-small');
  $('#modalConfirm').addClass('modal-big');
  $('#modalConfirmOk').html('OK');
  openModalConfirmImpl(msg, okFunc, calcelFunc);
}

function openModalConfirm(msg, okFunc, calcelFunc) {
  $('#modalConfirm').removeClass('modal-big');
  $('#modalConfirm').addClass('modal-small');
  $('#modalConfirmOk').html('OK');
  openModalConfirmImpl(msg, okFunc, calcelFunc);
}

function openModalConfirmImpl(msg, okFunc, calcelFunc) {
  $('.modal-big').hide();
  $('.modal-small').hide();
  $('#modalConfirm').css('display', 'flex');
  $('#wrapper').css('opacity', '0.5');
  $('#wrapper').css('pointer-events', 'none');
  $('#sidebar').css('opacity', '0.5');
  $('#sidebar').css('pointer-events', 'none');
  $('#modalConfirm>div>div').html(msg);
  $('#modalConfirm').focus();
  if (typeof okFunc === 'function') {
    confirmOkFunc = okFunc;
  } else {
    confirmOkFunc = null;
  }
  if (typeof calcelFunc === 'function') {
    confirmCalcelFunc = calcelFunc;
  } else {
    confirmCalcelFunc = null;
  }
}

function openModalInfo(msg, func) {
  $('#modalInfo').removeClass('modal-big');
  $('#modalInfo').addClass('modal-small');
  openModalInfoImpl(msg, func);
}

function openModalInfoBig(msg, func) {
  $('#modalInfo').removeClass('modal-small');
  $('#modalInfo').addClass('modal-big');
  openModalInfoImpl(msg, func);
}

function openModalInfoImpl(msg, func) {
  $('.modal-big').hide();
  $('.modal-small').hide();
  $('#modalInfo').css('display', 'flex');
  $('#wrapper').css('opacity', '0.5');
  $('#wrapper').css('pointer-events', 'none');
  $('#sidebar').css('opacity', '0.5');
  $('#sidebar').css('pointer-events', 'none');
  $('#modalInfo>div>div').html(msg);

  if (typeof func === 'function') {
    modalInfoFunc = func;
  } else {
    modalInfoFunc = null;
  }
}

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

ipcRenderer.on("download complete", (event, file) => {
  try {
    const newSar = getAppDataFolder() + '/update/app.asar';
    const oldSar = remote.app.getAppPath();
    const source = fs.createReadStream(newSar);
    const dest = fs.createWriteStream(oldSar, {
      flags: 'w+',
      mode: 0664
    });
    source.on('end', async function() {
      await removeFile(newSar);
      openModalConfirm('Update was completed!<br>Please restart the app to get the new features!<br>Restart now?', function() {
        remote.app.relaunch();
        remote.app.quit()
      });
    });
    source.on('error', function(err) {
      cannotUpdateInfo()
    });
    source.pipe(dest);
  } catch (err) {
    openModalInfo('Could not update. Error: ' + err);
  }
});

function cannotUpdateInfo() {
  const newSar = getAppDataFolder() + '/update/app.asar';
  const oldSar = remote.app.getAppPath();
  openModalInfoBig('Could not update. It seems that the app does not have permition to apply the update. In order to update you need to manually copy file "<span class="one-click-select">' + newSar + '</span>" and paste it here: "<span class="one-click-select">' + oldSar + '</span>".');
}

process.on('uncaughtException', function(error) {
  remote.app.quit()
  if (error.message.indexOf('operation not permitted, open') !== -1) {
    //We enter here when updating the app without permitions for the app folder.
    cannotUpdateInfo();
  } else {
    openModalInfoBig('An unexpected error occurred. The app will close itself.<br>Please send the following error to me at stefan@easycryptobot.com so I can fix it.<br><br>' + error.message, function() {
      remote.app.quit()
    }, function() {
      remote.app.quit()
    });
  }
}).on('unhandledRejection', (reason, p) => {
  openModalInfoBig('An unexpected error occurred. The app will close itself.<br>Please send the following error to me at stefan@easycryptobot.com so I can fix it.<br><br>' + reason + '<br>' + p, function() {
    remote.app.quit()
  }, function() {
    remote.app.quit()
  });
});

async function downloadUpdates() {
  openModalInfo('Downloading an Update..')
  const file = getAppDataFolder() + '/update/app.asar';
  try {
    await removeFile(file);
  } catch (err) {}
  ipcRenderer.send('download', {
    url: 'https://easycryptobot.com/downloads/app.asar',
    properties: {
      directory: getAppDataFolder() + '/update'
    }
  });
}

async function dailyCheckForUpdates() {
  while (true) {
    await sleep(1000 * 60 * 60 * 24); // 1 Day
    checkForUpdates({
      type: 'daily-check'
    }, true, false);
  }
}

async function hourlyCheckForUpdates() {
  while (true) {
    await sleep(1000 * 60 * 60 * 4); // 4 Hours
    checkForUpdates({
      type: 'hourly-check'
    }, false, false);
  }
}

function showUpdateMsg(isAutomatic) {
  if (isAutomatic) {
    openModalConfirm('An update is available!<br>Check what is new at at<br><span class="one-click-select">https://easycryptobot.com/update</span><br><br>Update now?', function() {
      downloadUpdates()
    });
  } else {
    openModalInfo('An update is available!<br>Check what is new at at<br><span class="one-click-select">https://easycryptobot.com/update</span><br><br>No automatic update is available for this version, so in order to update, you need to download again the app from <span class="one-click-select">https://easycryptobot.com/</span>. After the download you can extract the app at a new location and start it from there.')
  }
}

async function checkForUpdates(data, showUpdate, showNoUpdate) {
  let curVersion = remote.app.getVersion();
  $.ajax({
    type: 'get',
    url: 'https://easycryptobot.com/version.html',
    cache: false,
    data: data,
    success: function(data) {
      try {
        if (typeof data === 'string' && data.startsWith('version')) {
          let version = data.split(':');
          let latestVersion = version[1].trim();
          if (latestVersion != curVersion) {
            let latestSplited = latestVersion.split('.');
            let curSplited = curVersion.split('.');
            if (showUpdate) {
              showUpdateMsg(latestSplited[0] === curSplited[0]);
            }
            $('#updateBtn').click(function() {
              showUpdateMsg(latestSplited[0] === curSplited[0])
            });
            $('#checkForUpdateBtn').hide();
            $('#updateBtn').show();
          } else if (showNoUpdate) {
            openModalInfo('No update is available.')
          }
        } else if (showNoUpdate) {
          openModalInfo('No update is available.')
        }
      } catch (err) {}
    },
    error: function() {}
  });
}

async function getInteractiveContent() {
  $.ajax({
    type: 'get',
    url: 'https://easycryptobot.com/interactive.html',
    cache: false,
    data: {},
    success: function(data) {
      if (typeof data === 'string' && data.startsWith('<!--interactive-->')) {
        $('#interactive').html(data);
        $('#interactive').slideDown("slow");
      }
    },
    error: function() {}
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
          openModalInfo("Cannot write in applicatin folder!<br>Please contact stefan@easycryptobot.com", function() {
            remote.app.quit()
          });
        }
      }, function() {
        remote.app.quit()
      });
    } else {
      setTimeout(() => checkForUpdates({}, true, false), 600);
    }
  } catch (err) {
    openModalInfo("Cannot run the application!<br>Please contact stefan@easycryptobot.com", function() {
      remote.app.quit()
    });
  }
}

async function removeTmpFiles() {

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
  const file = getAppDataFolder() + '/db/tmp/' + name;
  return removeFile(file);
}

async function removeFile(file) {
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
  } else if (type === "xmr") {
    clipboard.writeText('472puZHEQRcCvt5MNtp7yg9awPWjywVQS9Vp4nSrBixgdBBQLEi4vZxUTGqUULDF7aWg2xaMcUr9yU2drx7PjDWn2fv65Dj');
    openModalInfo("Monero address is copied to clipboard");
  } else if (type === "paypal") {
    clipboard.writeText('stefan@easycryptobot.com');
    openModalInfo("Address is copied to clipboard");
  }
};
function copyMail() {
  clipboard.writeText('stefan@easycryptobot.com');
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
  if (typeof func === 'function') {
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
    $('#opStrategiesList').html("");
    strategies.forEach(function(d) {
      $('#btStrategiesList').append('<li><a href="#/" class="min-width25" onclick="dropDownItem(\'' + d.name + '\', \'#btStrategy\')">' + d.name + '</a></li>');
      $('#tsStrategiesList').append('<li><a href="#/" class="min-width25" onclick="dropDownItem(\'' + d.name + '\', \'#tsStrategy\')">' + d.name + '</a></li>');
      $('#opStrategiesList').append('<li><a href="#/" class="min-width25" onclick="dropDownItem(\'' + d.name + '\', \'#opStrategy\')">' + d.name + '</a></li>');
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
const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]
function formatDateNoYear(date) {
  if (!(date instanceof Date)) {
    return '';
  }
  var srt = addZero(date.getDate()) + '-' + months[date.getMonth()] + ' ' + addZero(date.getHours()) + ':' + addZero(date.getMinutes()) + ':' + addZero(date.getSeconds());
  return srt;
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

//Add additional 300 ticks to the start date in order to calculate RSIs and EMAs
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
      startDate.setDate(startDate.getDate() - 3);
      break;
    case '30 minutes':
      startDate.setDate(startDate.getDate() - 6);
      break;
    case '1 hour':
      startDate.setDate(startDate.getDate() - 12);
      break;
    case '2 hours':
      startDate.setDate(startDate.getDate() - 25);
      break;
    case '4 hours':
      startDate.setDate(startDate.getDate() - 50);
      break;
    case '6 hours':
      startDate.setDate(startDate.getDate() - 75);
      break;
    case '12 hours':
      startDate.setDate(startDate.getDate() - 150);
      break;
    case '1 day':
      startDate.setDate(startDate.getDate() - 300);
      break;
  }
  return startDate;
}

function chunkArray(myArray, chunkSize) {
  var result = [];
  while (myArray.length) {
    result.push(myArray.splice(0, chunkSize));
  }
  return result;
}

function opKeyDownDoNothing(e) {
  e.preventDefault();
}
