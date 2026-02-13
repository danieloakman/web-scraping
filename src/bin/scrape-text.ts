#! bun
import { extractText } from "@/functions/webpage/utils";
import { launchBrowser } from "@/utils/browser";
import meow from "meow";
import { writeFileSync } from "fs";

if (import.meta.main) {
  const { input: urls, flags: { output } } = meow(`Scrape the text from webpages.

  Usage:
    $ scrape-text <url>...

  Examples:
    $ scrape-text https://www.google.com
    $ scrape-text https://www.google.com https://www.bing.com`, {
    importMeta: import.meta,
    argv: process.argv,
    flags: {
      output: {
        type: 'string',
        default: '',
        shortFlag: 'o',
        description: 'The output json file path to write to. If not provided, the text will be written to the console.',
      }
    }
  });

  await using browser = await launchBrowser();
  const result: Record<string, string> = {};
  for (const url of urls) {
    console.log(`Scraping ${url} ...`);
    const text = await extractText(browser, url);
    if (output)
      result[url] = text;
    else
      console.log(text + '\n\n');
  }
  if (output)
    writeFileSync(output, JSON.stringify(result, null, 2));
}