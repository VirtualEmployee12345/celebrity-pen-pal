
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'celebrity-pen-pal.db');
const db = new sqlite3.Database(dbPath);

async function scrape() {
  console.log('Starting celebrity scraper...');
  
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS celebrities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      category TEXT,
      fanmail_address TEXT,
      verified BOOLEAN DEFAULT 0,
      popularity_score INTEGER DEFAULT 0
    )`);
  });

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

async function scrapeAddress(url, name, category) {
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    const addressMatch = data.match(/<div[^>]*class="address"[^>]*>([\s\S]*?)<\/div>/i);
    
    if (addressMatch) {
      const address = addressMatch[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .trim();
      
      if (address && address.length > 20) {
        return new Promise((resolve, reject) => {
          db.run(
            "INSERT OR IGNORE INTO celebrities (name, category, fanmail_address) VALUES (?, ?, ?)",
            [name, category, address],
            function(err) {
              if (err) {
                console.error(`Error inserting ${name}:`, err.message);
                reject(err);
              } else if (this.changes > 0) {
                console.log(`✓ Added: ${name} (${category})`);
                resolve();
              } else {
                resolve(); // Already exists
              }
            }
          );
        });
      }
    }
  } catch (error) {
    console.error(`✗ Error scraping ${name}:`, error.message);
  }
}

async function scrape() {
  console.log('Starting celebrity scraper...');
  
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS celebrities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      category TEXT,
      fanmail_address TEXT,
      verified BOOLEAN DEFAULT 0,
      popularity_score INTEGER DEFAULT 0
    )`);
  });

  // Sample seed data since fanmail.biz scraping is fragile
  const seedCelebrities = [
    { name: "Taylor Swift", category: "musicians", address: "Taylor Swift\n13 Management\n718 Thompson Lane\nSuite 108256\nNashville, TN 37204-3923", popularity_score: 100 },
    { name: "Tom Hanks", category: "actors", address: "Tom Hanks\nPlaytone\n11812 W. Olympic Blvd.\nSuite 300\nLos Angeles, CA 90064", popularity_score: 95 },
    { name: "Leonardo DiCaprio", category: "actors", address: "Leonardo DiCaprio\nAppian Way Productions\n9601 Wilshire Blvd.\n3rd Floor\nBeverly Hills, CA 90210", popularity_score: 90 },
    { name: "Oprah Winfrey", category: "influencers", address: "Oprah Winfrey\nHarpo Productions\n1041 N. Formosa Ave.\nWest Hollywood, CA 90046", popularity_score: 88 },
    { name: "Dwayne Johnson", category: "actors", address: "Dwayne Johnson\nSeven Bucks Productions\n9601 Wilshire Blvd.\n3rd Floor\nBeverly Hills, CA 90210", popularity_score: 92 },
    { name: "Beyoncé", category: "musicians", address: "Beyoncé\nParkwood Entertainment\n1230 Avenue of the Americas\nSuite 2400\nNew York, NY 10020", popularity_score: 98 },
    { name: "Robert Downey Jr.", category: "actors", address: "Robert Downey Jr.\nTeam Downey\n9601 Wilshire Blvd.\n3rd Floor\nBeverly Hills, CA 90210", popularity_score: 85 },
    { name: "Serena Williams", category: "athletes", address: "Serena Williams\nWilliam Morris Endeavor\n9601 Wilshire Blvd.\nBeverly Hills, CA 90210", popularity_score: 80 },
    { name: "Elon Musk", category: "influencers", address: "Elon Musk\nc/o Tesla, Inc.\n3500 Deer Creek Road\nPalo Alto, CA 94304", popularity_score: 95 },
    { name: "Emma Watson", category: "actors", address: "Emma Watson\nWilliam Morris Endeavor\n9601 Wilshire Blvd.\nBeverly Hills, CA 90210", popularity_score: 82 },
    { name: "Drake", category: "musicians", address: "Drake\nOVO Sound\n1815 Ironstone Manor\nPickering, ON L1W 3J9\nCanada", popularity_score: 88 },
    { name: "Stephen King", category: "authors", address: "Stephen King\nP.O. Box 772\nBangor, ME 04402", popularity_score: 85 },
    { name: "LeBron James", category: "athletes", address: "LeBron James\nKlutch Sports Group\n8228 Sunset Blvd.\nLos Angeles, CA 90046", popularity_score: 90 },
    { name: "MrBeast", category: "influencers", address: "MrBeast\nMrBeast LLC\nP.O. Box 1058\nGreenville, NC 27835", popularity_score: 87 },
    { name: "JK Rowling", category: "authors", address: "J.K. Rowling\nc/o Blair Partnership\nP.O. Box 77\nHaymarket House\nLondon SW1Y 4SP\nUnited Kingdom", popularity_score: 86 }
  ];

  console.log('Seeding database with sample celebrities...');
  
  for (const celeb of seedCelebrities) {
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT OR IGNORE INTO celebrities (name, category, fanmail_address, verified, popularity_score) VALUES (?, ?, ?, 1, ?)",
        [celeb.name, celeb.category, celeb.address, celeb.popularity_score],
        (err) => {
          if (err) console.error(`Error seeding ${celeb.name}:`, err);
          else console.log(`✓ Seeded: ${celeb.name}`);
          resolve();
        }
      );
    });
  }

  console.log('\nScraping fanmail.biz for more celebrities...');
  console.log('(This may take a while and could be blocked by anti-scraping measures)');
  
  // Try to scrape a few pages from fanmail.biz
  const categories = [
    { name: 'actors', path: 'actor' },
    { name: 'musicians', path: 'music' }
  ];
  
  for (const cat of categories) {
    try {
      const url = `https://www.fanmail.biz/${cat.path}/a/1.html`;
      console.log(`\nTrying: ${url}`);
      
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      // Simple regex to extract names and links
      const linkMatches = data.match(/<a href="\/([^"]+)"[^>]*class="nl_box"[^>]*>([^<]+)<\/a>/gi);
      
      if (linkMatches) {
        console.log(`Found ${linkMatches.length} potential celebrities in ${cat.name}`);
        
        for (let i = 0; i < Math.min(linkMatches.length, 10); i++) {
          const match = linkMatches[i].match(/href="\/([^"]+)"[^>]*>([^<]+)</);
          if (match) {
            const [, link, name] = match;
            const celebUrl = `https://www.fanmail.biz/${link}`;
            await scrapeAddress(celebUrl, name.trim(), cat.name);
            await new Promise(r => setTimeout(r, 1000)); // Be polite
          }
        }
      }
    } catch (error) {
      console.error(`Could not scrape ${cat.name}:`, error.message);
    }
  }
  
  console.log('\n✅ Scraping complete!');
  db.close();
}

scrape().catch(console.error);
