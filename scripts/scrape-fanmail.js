
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('better-sqlite3')('../data/starletters.db');

async function scrape() {
  db.exec("CREATE TABLE IF NOT EXISTS celebrities (id INTEGER PRIMARY KEY, name TEXT, address TEXT)");

  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  for (const letter of alphabet) {
    const url = `https://www.fanmail.biz/actor/${letter}/1.html`;
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      const promises = [];
      $('.nl_box a').each((i, el) => {
        const name = $(el).text();
        const link = $(el).attr('href');
        const celebrityUrl = `https://www.fanmail.biz/${link}`;
        promises.push(scrapeAddress(celebrityUrl, name));
      });
      await Promise.all(promises);
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
    }
  }

  db.close();
}

async function scrapeAddress(url, name) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const address = $('.address').text().trim();
    if (address) {
      db.prepare("INSERT INTO celebrities (name, address) VALUES (?, ?)").run(name, address);
      console.log(`Added: ${name}`);
    }
  } catch (error) {
    console.error(`Error scraping address for ${name}:`, error);
  }
}

scrape();
