'use strict';
const { spawn } = require('child_process');

module.exports.openChrome = function () {
  return new Promise((resolve, reject) => {
    const chrome = spawn(
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      [
        '--remote-debugging-port=9222'
      ]
    );
    function onData (data) {
      data = data.toString();
      if (/listening on .+/.test(data)) {
        resolve(data.match(/ws.+/)[0]);
      } else if (/error/.test(data)) {
        reject(data.stack || data);
      }
    }
    chrome.stdout.on('data', onData);
    chrome.on('message', onData);
    chrome.stderr.on('data', onData);
    chrome.on('error', onData);
  });
};

module.exports.sleep = function (ms) {
  console.log(`Sleeping for ${ms}ms`);
  return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports.logPageConsole = function (message) {
  if (!message.text().includes('ERR_BLOCKED_BY_CLIENT'))
    console.log(message.text());
};

module.exports.clickButtonThatIncludes = function (buttonInnerHTML) {
  const buttons = document.getElementsByTagName('button');
  for (const button of buttons) {
    if (button.innerHTML.includes(buttonInnerHTML)) {
      button.click();
      break;
    }
  }
};
