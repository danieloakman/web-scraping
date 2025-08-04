
import {test, expect} from '@playwright/test'
import { api } from './instagram-locations';

test('test', async ({ page }) => {
  await page.goto('https://playwright.dev');
  const title = page.locator('.navbar__inner .navbar__title');
  await expect(title).toHaveText('Playwright');
});
// const result = await api.call({});

// console.log(result);
