const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database setup
const dbPath = path.join(dataDir, 'celebrity-pen-pal.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS celebrities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    image_url TEXT,
    bio TEXT,
    fanmail_address TEXT,
    verified BOOLEAN DEFAULT 0,
    popularity_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    celebrity_id INTEGER,
    customer_email TEXT,
    message TEXT,
    handwriting_style TEXT,
    status TEXT DEFAULT 'pending',
    handwrytten_order_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (celebrity_id) REFERENCES celebrities(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS forum_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    celebrity_id INTEGER,
    author_name TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (celebrity_id) REFERENCES celebrities(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS forum_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER,
    author_name TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_id) REFERENCES forum_topics(id)
  )`);
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Get celebrities
app.get('/api/celebrities', (req, res) => {
  const { category, search, limit = 20 } = req.query;
  let query = 'SELECT * FROM celebrities WHERE 1=1';
  const params = [];
  
  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }
  
  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  
  query += ' ORDER BY popularity_score DESC LIMIT ?';
  params.push(parseInt(limit));
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// API: Get single celebrity
app.get('/api/celebrities/:id', (req, res) => {
  db.get('SELECT * FROM celebrities WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) return res.status(404).json({ error: 'Celebrity not found' });
    res.json(row);
  });
});

// API: Create letter order
app.post('/api/letters', (req, res) => {
  const { celebrity_id, customer_email, message, handwriting_style } = req.body;
  
  // TODO: Integrate with Handwrytten API
  const stmt = db.prepare(`
    INSERT INTO letters (celebrity_id, customer_email, message, handwriting_style)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(celebrity_id, customer_email, message, handwriting_style, function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to create letter' });
    }
    
    res.json({ 
      success: true, 
      letter_id: this.lastID,
      status: 'pending'
    });
  });
  stmt.finalize();
});

// API: Forum topics
app.get('/api/forum/topics', (req, res) => {
  db.all(`
    SELECT t.*, c.name as celebrity_name, 
           (SELECT COUNT(*) FROM forum_replies WHERE topic_id = t.id) as reply_count
    FROM forum_topics t
    LEFT JOIN celebrities c ON t.celebrity_id = c.id
    ORDER BY t.created_at DESC
  `, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

app.get('/api/forum/topics/:id', (req, res) => {
  const topicId = req.params.id;
  
  db.get(`
    SELECT t.*, c.name as celebrity_name
    FROM forum_topics t
    LEFT JOIN celebrities c ON t.celebrity_id = c.id
    WHERE t.id = ?
  `, [topicId], (err, topic) => {
    if (err || !topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    
    db.all('SELECT * FROM forum_replies WHERE topic_id = ? ORDER BY created_at', [topicId], (err, replies) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ topic, replies });
    });
  });
});

app.post('/api/forum/topics', (req, res) => {
  const { title, celebrity_id, author_name, content } = req.body;
  
  const stmt = db.prepare(`
    INSERT INTO forum_topics (title, celebrity_id, author_name, content)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(title, celebrity_id || null, author_name, content, function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to create topic' });
    }
    res.json({ success: true, topic_id: this.lastID });
  });
  stmt.finalize();
});

app.post('/api/forum/topics/:id/replies', (req, res) => {
  const { author_name, content } = req.body;
  const topicId = req.params.id;
  
  const stmt = db.prepare(`
    INSERT INTO forum_replies (topic_id, author_name, content)
    VALUES (?, ?, ?)
  `);
  
  stmt.run(topicId, author_name, content, function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to create reply' });
    }
    res.json({ success: true, reply_id: this.lastID });
  });
  stmt.finalize();
});

// Seed database if empty
db.get('SELECT COUNT(*) as count FROM celebrities', (err, row) => {
  if (err || !row || row.count === 0) {
    console.log('Seeding database with initial celebrities...');
    const seedData = [
      { name: "Taylor Swift", category: "musicians", address: "Taylor Swift\n13 Management\n718 Thompson Lane\nSuite 108256\nNashville, TN 37204-3923", popularity: 100 },
      { name: "Tom Hanks", category: "actors", address: "Tom Hanks\nPlaytone\n11812 W. Olympic Blvd.\nSuite 300\nLos Angeles, CA 90064", popularity: 95 },
      { name: "Leonardo DiCaprio", category: "actors", address: "Leonardo DiCaprio\nAppian Way Productions\n9601 Wilshire Blvd.\n3rd Floor\nBeverly Hills, CA 90210", popularity: 90 },
      { name: "Oprah Winfrey", category: "influencers", address: "Oprah Winfrey\nHarpo Productions\n1041 N. Formosa Ave.\nWest Hollywood, CA 90046", popularity: 88 },
      { name: "Dwayne Johnson", category: "actors", address: "Dwayne Johnson\nSeven Bucks Productions\n9601 Wilshire Blvd.\n3rd Floor\nBeverly Hills, CA 90210", popularity: 92 }
    ];
    
    const stmt = db.prepare('INSERT OR IGNORE INTO celebrities (name, category, fanmail_address, verified, popularity_score) VALUES (?, ?, ?, 1, ?)');
    seedData.forEach(c => stmt.run(c.name, c.category, c.address, c.popularity));
    stmt.finalize();
    console.log('Database seeded!');
  }
});

app.listen(PORT, () => {
  console.log(`Celebrity Pen Pal server running on port ${PORT}`);
});
