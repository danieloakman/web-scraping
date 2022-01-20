'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const { join } = require('path');
const { openChrome, sleep, logPageConsole, clickButtonThatIncludes } = require('./utils');

const MENU_BUTTON_SELECTOR = '.nhb85d-zuz9Sc-haAclf';
const YOUR_PLACES_SELECTOR = ':contains("Your places")'; // '.KY3DLe-settings-list-ibnC6b';
const GMAPS_LIST_NAME = 'Chicklet places';

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
  await page.mouse.click(0, 100);
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
    })).filter(a => list.find(b => a.name === b.name) === undefined);
    if (!places.length)
      break;
    list.push(...places);
    // await sleep(2e3);
  }
  fs.writeFileSync(
    join(__dirname, `${GMAPS_LIST_NAME}.csv`),
    // `Name|Note|Misc\n${list.map(({ name, note, misc }) => `"${name}"|"${note}"|"${misc.join(' - ')}"`).join('\n')}`
  );

  await browser.close();
})();
