import { APIGatewayProxyEventV2 } from 'aws-lambda';
import playwright from 'playwright-aws-lambda';

const INSTAGRAM_LOCATION_URL = 'https://www.instagram.com/explore/locations';

export async function handler(evt: APIGatewayProxyEventV2) {
  const browser = await playwright.launchChromium();
  const page = await browser.newPage();
  await page.goto(INSTAGRAM_LOCATION_URL);
  // await page.waitForLoadState('networkidle');
  // await page.waitForTimeout(10000);
  const anchorSelectors = 'main ul a[href*="explore/locations"]';
  await page.waitForSelector(anchorSelectors);
  const anchors = await page.$$(anchorSelectors);
  const links = await Promise.all(
    anchors.map((anchor) => Promise.all([anchor.getAttribute('href'), anchor.innerText()] as const))
  );
  console.log(links);
  return {
    statusCode: 200,
    body: JSON.stringify(links),
  };
}
