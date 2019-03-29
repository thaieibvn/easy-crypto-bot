// Modules to control application life and create native browser window
const {app, BrowserWindow, ipcMain, dialog} = require('electron')
const {download} = require("electron-dl");

global.optimizatin = {
  timeframe: null,
  startDate: null,
  ticks: null,
  ticks1m: null,
  strategyVariations:null,
  results:null
};
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
app.disableHardwareAcceleration();
//app.commandLine.appendSwitch('enable-transparent-visuals');
//app.commandLine.appendSwitch('disable-gpu');
function createWindow() {
  // Create the browser window.

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 975,
    minWidth: 830,
    minHeight: 300,
    title: "EasyCryptoBot v" + app.getVersion(),
    icon: "./assets/icons/icon.png",
    webPreferences: {
      nodeIntegrationInWorker: true
    }
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')
  mainWindow.setMenu(null);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
    app.quit();
  });

  ipcMain.on("download", (event, info) => {
    download(BrowserWindow.getFocusedWindow(), info.url, info.properties).then(dl => mainWindow.webContents.send("download complete", dl.getSavePath()));
  });

  mainWindow.webContents.on('crashed', (e) => {
    dialog.showErrorBox('The App has crashed and will be restarted :(','Please contact me at stefan@easycryptobot.com with details what happened so I can fix it! Thanks!');
    console.log(e);
    app.relaunch();
    app.quit()
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  //if (process.platform !== 'darwin') {
  app.quit()
  //}
})

app.on('activate', function() {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
