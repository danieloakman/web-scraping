#! bun
import { extractText } from "@/functions/webpage/utils";
import { launchBrowser } from "@/utils/browser";
import meow from "meow";
import { writeFileSync } from "fs";

if (import.meta.main) {
  const { input: urls, flags: { output, help }, showHelp } = meow(`Scrape the text from webpages.

  Usage:
    $ scrape-text <url>...

  Examples:
    $ scrape-text https://www.google.com
    $ scrape-text https://www.google.com https://www.bing.com`, {
    importMeta: import.meta,
    flags: {
      help: {
        type: 'boolean',
        default: false,
        shortFlag: 'h',
        description: 'Show help message and exit.',
      },
      output: {
        type: 'string',
        default: '',
        shortFlag: 'o',
        description: 'The output json file path to write to. If not provided, the text will be written to the console.',
      }
    },
  });
  if (help)
    showHelp(0);
  if (!urls.length) {
    console.error('No URLs provided');
    process.exit(1);
  }

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