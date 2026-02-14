import { newPage } from "@/utils/browser";
import type { Browser, Page } from "playwright-core";

export async function extractText(browser: Browser, url: string) {
  await using page = await newPage(browser);
  await page.goto(url, { timeout: 10000 });
  return getPageText(page);
}

export function getPageText(page: Page) {
  return page.evaluate(
    () => {
      const text = (document.querySelector('main') ?? document.querySelector('body'))?.innerText;
      if (!text) throw new Error('Could not find main element to get text content from');
      return text;
    },
    {
      timeout: 10000
    }
  );
}
