
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('../data/starletters.db');

async function scrape() {
  db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS celebrities (id INTEGER PRIMARY KEY, name TEXT, address TEXT)");
  });

  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  for (const letter of alphabet) {
    const url = `https://www.fanmail.biz/actor/${letter}/1.html`;
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      $('.nl_box a').each((i, el) => {
        const name = $(el).text();
        const link = $(el).attr('href');
        // Now I need to go to the individual celebrity page to get the address
        // This will be another axios call, and then I can insert into the database
        console.log({name, link});
      });
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
    }
  }

  db.close();
}

scrape();
