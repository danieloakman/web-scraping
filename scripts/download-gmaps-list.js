'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const { join } = require('path');
const { openChrome, sleep, logPageConsole, clickButtonThatIncludes, callSafely } = require('./utils');

const MENU_BUTTON_SELECTOR = '.nhb85d-zuz9Sc-haAclf';
const YOUR_PLACES_SELECTOR = ':contains("Your places")'; // '.KY3DLe-settings-list-ibnC6b';
const GMAPS_LIST_NAME = 'Chicklet places';

function jsonToCSV (placesList) {
  return `"Name"|"Note"|"Misc"\n${
    placesList.map(({ name, note, misc }) =>
      `"${name.trim()}"|"${note.trim().replace(/[\n]/g, '\\n')}"|"${misc.join('\\n')}"`
    ).join('\n')}
  `;
};

function csvToJSON (csv) {
  return csv
    .split('\n')
    .slice(1)
    .map(line => {
      const [name, note, misc] = line
        .split('|')
        .map(str => str.substring(1, str.length - 1).trim())
      return {
        name,
        note: note ? note.replace(/\\n/g, '\n') : '',
        misc: misc ? misc.split('\\n').map(str => str.trim()): []
      };
    });
}

(async () => {
  const browser = await puppeteer.connect({
    browserWSEndpoint: await openChrome()
  });
  const page = (await browser.pages())[0];
  page.on('console', logPageConsole);
  await page.waitForNetworkIdle({ timeout: 10000 });

  await page.goto('https://www.google.com/maps', { waitUntil: 'networkidle0' });

  await page.click(MENU_BUTTON_SELECTOR);
  await sleep(1e3);

  await page.evaluate(clickButtonThatIncludes, 'Your places');
  await sleep(3e3);

  await page.evaluate(clickButtonThatIncludes, GMAPS_LIST_NAME)
  await sleep(3e3);

  const numOfPlaces = await page.evaluate(() => {
    for (const h2 of document.querySelectorAll('h2'))
      if (/Shared.*\d+ *places/.test(h2.textContent))
        return parseFloat(h2.textContent.match(/\d+/)[0]);
    console.log('Could not find number of places.');
    return 0;
  });

  await page.mouse.click(0, 0);
  const list = [];
  while (true) {
    for (let i = 0; i < 10; i++)
      await page.keyboard.press('PageDown');
    await sleep(3e3);
    const places = (await page.evaluate(() => {
      const callSafely = (fn, _this, ...args) => {
        try {
          return fn(...args);
        } catch (_) {
          return null;
        }
      };
      const places = [];
      for (const place of document.getElementsByClassName('ZQyzS-aVTXAb')) {
        const name = place.getAttribute('aria-label');
        places.push(callSafely(() => ({
          name,
          note: callSafely(() => place.children[2].children[0].children[0].children[0].children[0].children[0].innerHTML),
          misc: place.children[1].innerText.split('\n').filter(str => str !== name)
        })));
      }
      return places;
    })); //.filter(a => list.find(b => a.name === b.name) === undefined);
    // if (places.length % 20 !== 0) {
    //   console.log('Could not find all places.');
    // }
    if (places.length === numOfPlaces) {
      list.push(...places);
      break;
    }
    // await sleep(2e3);
  }

  const jsonPath = join(__dirname, '../output', `${GMAPS_LIST_NAME}.json`);
  const csvPath = join(__dirname, '../output', `${GMAPS_LIST_NAME}.csv`);
  // fs.writeFileSync(jsonPath, JSON.stringify(list, null, 2));
  // const oldJson = fs.existsSync(csvPath) ? csvToJSON(fs.readFileSync(csvPath, 'utf-8')) : [];

  fs.writeFileSync(csvPath, jsonToCSV(list));
  // const list = csvToJSON(fs.readFileSync(csvPath, 'utf8'));

  await browser.close();
})();
