const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Determine data directory (Render uses /opt/render/project/src/data with disk)
const dataDir = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, 'data');

// Ensure data directory exists
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory:', dataDir);
  }
} catch (err) {
  console.error('Failed to create data directory:', err);
  // Fallback to local data dir
  const fallbackDir = path.join(__dirname, 'data');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
}

// Database setup
const dbPath = path.join(dataDir, 'celebrity-pen-pal.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

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
  )`, (err) => {
    if (err) console.error('Error creating celebrities table:', err);
  });
  
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
  )`, (err) => {
    if (err) console.error('Error creating letters table:', err);
  });
  
  db.run(`CREATE TABLE IF NOT EXISTS forum_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    celebrity_id INTEGER,
    author_name TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (celebrity_id) REFERENCES celebrities(id)
  )`, (err) => {
    if (err) console.error('Error creating forum_topics table:', err);
  });
  
  db.run(`CREATE TABLE IF NOT EXISTS forum_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER,
    author_name TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_id) REFERENCES forum_topics(id)
  )`, (err) => {
    if (err) console.error('Error creating forum_replies table:', err);
  });
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check for Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
      console.error('Database error in /api/celebrities:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// API: Get single celebrity
app.get('/api/celebrities/:id', (req, res) => {
  db.get('SELECT * FROM celebrities WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) return res.status(404).json({ error: 'Celebrity not found' });
    res.json(row);
  });
});

// Import Handwrytten service
const handwrytten = require('./services/handwrytten');

// API: Create letter order
app.post('/api/letters', async (req, res) => {
  const { celebrity_id, customer_email, message, handwriting_style, return_address, sender_name } = req.body;
  
  if (!celebrity_id || !customer_email || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Get celebrity details from database
  db.get('SELECT * FROM celebrities WHERE id = ?', [celebrity_id], async (err, celebrity) => {
    if (err || !celebrity) {
      return res.status(404).json({ error: 'Celebrity not found' });
    }
    
    // Check if we have a valid address
    if (!celebrity.fanmail_address) {
      return res.status(400).json({ error: 'No fanmail address available for this celebrity' });
    }
    
    try {
      // Save letter to database first
      const stmt = db.prepare(`
        INSERT INTO letters (celebrity_id, customer_email, message, handwriting_style, status)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(celebrity_id, customer_email, message, handwriting_style || 'casual', 'processing', async function(err) {
        if (err) {
          console.error('Error creating letter:', err);
          return res.status(500).json({ error: 'Failed to create letter' });
        }
        
        const letter_id = this.lastID;
        
        // Try to send via Handwrytten if credentials are configured
        if (process.env.HANDWRYTTEN_API_KEY && process.env.HANDWRYTTEN_API_SECRET) {
          try {
            const result = await handwrytten.sendLetter(celebrity, message, {
              handwriting_style: handwriting_style || 'casual',
              return_address: return_address,
              sender_name: sender_name
            });
            
            // Update letter with Handwrytten order ID
            db.run('UPDATE letters SET handwrytten_order_id = ?, status = ? WHERE id = ?', 
              [result.order_id, result.status, letter_id]);
            
            res.json({ 
              success: true, 
              letter_id: letter_id,
              handwrytten_order_id: result.order_id,
              status: result.status,
              preview_url: result.preview_url
            });
          } catch (hwError) {
            console.error('Handwrytten API error:', hwError);
            // Mark as pending manual processing
            db.run('UPDATE letters SET status = ? WHERE id = ?', ['pending', letter_id]);
            res.json({ 
              success: true, 
              letter_id: letter_id,
              status: 'pending',
              message: 'Letter queued for processing'
            });
          }
        } else {
          // No Handwrytten credentials, mark as pending
          res.json({ 
            success: true, 
            letter_id: letter_id,
            status: 'pending',
            message: 'Letter queued for manual processing'
          });
        }
      });
      stmt.finalize();
      
    } catch (error) {
      console.error('Error processing letter:', error);
      res.status(500).json({ error: 'Failed to process letter' });
    }
  });
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
      console.error('Database error in forum topics:', err);
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
  
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content required' });
  }
  
  const stmt = db.prepare(`
    INSERT INTO forum_topics (title, celebrity_id, author_name, content)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(title, celebrity_id || null, author_name || 'Anonymous', content, function(err) {
    if (err) {
      console.error('Error creating topic:', err);
      return res.status(500).json({ error: 'Failed to create topic' });
    }
    res.json({ success: true, topic_id: this.lastID });
  });
  stmt.finalize();
});

app.post('/api/forum/topics/:id/replies', (req, res) => {
  const { author_name, content } = req.body;
  const topicId = req.params.id;
  
  if (!content) {
    return res.status(400).json({ error: 'Content required' });
  }
  
  const stmt = db.prepare(`
    INSERT INTO forum_replies (topic_id, author_name, content)
    VALUES (?, ?, ?)
  `);
  
  stmt.run(topicId, author_name || 'Anonymous', content, function(err) {
    if (err) {
      console.error('Error creating reply:', err);
      return res.status(500).json({ error: 'Failed to create reply' });
    }
    res.json({ success: true, reply_id: this.lastID });
  });
  stmt.finalize();
});

// Seed database if empty
function seedDatabase() {
  db.get('SELECT COUNT(*) as count FROM celebrities', (err, row) => {
    if (err) {
      console.error('Error checking celebrity count:', err);
      return;
    }
    
    if (!row || row.count === 0) {
      console.log('Seeding database with initial celebrities...');
      const seedData = [
        { name: "Taylor Swift", category: "musicians", address: "Taylor Swift\n13 Management\n718 Thompson Lane\nSuite 108256\nNashville, TN 37204-3923", popularity: 100 },
        { name: "Tom Hanks", category: "actors", address: "Tom Hanks\nPlaytone\n11812 W. Olympic Blvd.\nSuite 300\nLos Angeles, CA 90064", popularity: 95 },
        { name: "Leonardo DiCaprio", category: "actors", address: "Leonardo DiCaprio\nAppian Way Productions\n9601 Wilshire Blvd.\n3rd Floor\nBeverly Hills, CA 90210", popularity: 90 },
        { name: "Oprah Winfrey", category: "influencers", address: "Oprah Winfrey\nHarpo Productions\n1041 N. Formosa Ave.\nWest Hollywood, CA 90046", popularity: 88 },
        { name: "Dwayne Johnson", category: "actors", address: "Dwayne Johnson\nSeven Bucks Productions\n9601 Wilshire Blvd.\n3rd Floor\nBeverly Hills, CA 90210", popularity: 92 },
        { name: "Beyoncé", category: "musicians", address: "Beyoncé\nParkwood Entertainment\n1230 Avenue of the Americas\nSuite 2400\nNew York, NY 10020", popularity: 98 },
        { name: "Robert Downey Jr.", category: "actors", address: "Robert Downey Jr.\nTeam Downey\n9601 Wilshire Blvd.\n3rd Floor\nBeverly Hills, CA 90210", popularity: 85 },
        { name: "Serena Williams", category: "athletes", address: "Serena Williams\nWilliam Morris Endeavor\n9601 Wilshire Blvd.\nBeverly Hills, CA 90210", popularity: 80 },
        { name: "Elon Musk", category: "influencers", address: "Elon Musk\nc/o Tesla, Inc.\n3500 Deer Creek Road\nPalo Alto, CA 94304", popularity: 95 },
        { name: "Emma Watson", category: "actors", address: "Emma Watson\nWilliam Morris Endeavor\n9601 Wilshire Blvd.\nBeverly Hills, CA 90210", popularity: 82 },
        { name: "Drake", category: "musicians", address: "Drake\nOVO Sound\n1815 Ironstone Manor\nPickering, ON L1W 3J9\nCanada", popularity: 88 },
        { name: "Stephen King", category: "authors", address: "Stephen King\nP.O. Box 772\nBangor, ME 04402", popularity: 85 },
        { name: "LeBron James", category: "athletes", address: "LeBron James\nKlutch Sports Group\n8228 Sunset Blvd.\nLos Angeles, CA 90046", popularity: 90 },
        { name: "MrBeast", category: "influencers", address: "MrBeast\nMrBeast LLC\nP.O. Box 1058\nGreenville, NC 27835", popularity: 87 },
        { name: "JK Rowling", category: "authors", address: "J.K. Rowling\nc/o Blair Partnership\nP.O. Box 77\nHaymarket House\nLondon SW1Y 4SP\nUnited Kingdom", popularity: 86 }
      ];
      
      const stmt = db.prepare('INSERT OR IGNORE INTO celebrities (name, category, fanmail_address, verified, popularity_score) VALUES (?, ?, ?, 1, ?)');
      seedData.forEach(c => stmt.run(c.name, c.category, c.address, c.popularity));
      stmt.finalize();
      console.log('Database seeded with', seedData.length, 'celebrities!');
    } else {
      console.log('Database already has', row.count, 'celebrities');
    }
  });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Celebrity Penpal server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Data directory: ${dataDir}`);
  
  // Seed after server starts
  setTimeout(seedDatabase, 1000);
});
