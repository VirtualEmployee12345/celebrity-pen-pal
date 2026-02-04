const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Simple password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate a simple session token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

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

function logDbStatus(context) {
  const exists = fs.existsSync(dbPath);
  let size = 0;
  try {
    size = exists ? fs.statSync(dbPath).size : 0;
  } catch (err) {
    console.error(`[${context}] Failed to read db stats:`, err);
  }
  console.log(`[${context}] DB file exists:`, exists, 'size:', size);
}

db.serialize(() => {
  // Users table for authentication
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Updated celebrities table - can be official celebs OR user penpals
  db.run(`CREATE TABLE IF NOT EXISTS celebrities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    image_url TEXT,
    bio TEXT,
    fanmail_address TEXT,
    verified BOOLEAN DEFAULT 0,
    popularity_score INTEGER DEFAULT 0,
    user_id INTEGER,
    is_public BOOLEAN DEFAULT 1,
    created_by_user_id INTEGER,
    relationship_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    celebrity_id INTEGER,
    customer_email TEXT,
    customer_name TEXT,
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

  logDbStatus('db-init');
  db.get('SELECT COUNT(*) as count FROM celebrities', (err, row) => {
    if (err) {
      console.error('[db-init] Error counting celebrities:', err);
      return;
    }
    console.log('[db-init] Celebrity count:', row ? row.count : 'unknown');
  });
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Import Handwrytten service
const handwrytten = require('./services/handwrytten');

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/become-penpal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'become-penpal.html'));
});

app.get('/add-family', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'add-family.html'));
});

// Health check for Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// AUTHENTICATION ROUTES

// Register new user
app.post('/api/auth/register', (req, res) => {
  const { email, password, display_name } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  const password_hash = hashPassword(password);
  const token = generateToken();
  
  db.run(
    'INSERT INTO users (email, password_hash, display_name, token) VALUES (?, ?, ?, ?)',
    [email, password_hash, display_name || email.split('@')[0], token],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'Email already registered' });
        }
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Registration failed' });
      }
      
      res.json({
        success: true,
        user_id: this.lastID,
        token: token,
        email: email,
        display_name: display_name || email.split('@')[0]
      });
    }
  );
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  const password_hash = hashPassword(password);
  
  db.get(
    'SELECT * FROM users WHERE email = ? AND password_hash = ?',
    [email, password_hash],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Generate new token
      const token = generateToken();
      db.run('UPDATE users SET token = ? WHERE id = ?', [token, user.id]);
      
      res.json({
        success: true,
        user_id: user.id,
        token: token,
        email: user.email,
        display_name: user.display_name
      });
    }
  );
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  db.get('SELECT id, email, display_name, bio, avatar_url FROM users WHERE token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.json(user);
  });
});

// USER PENPAL ROUTES

// Become a penpal (create public or private profile)
app.post('/api/become-penpal', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { fanmail_address, bio, category, is_public } = req.body;
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (!fanmail_address) {
    return res.status(400).json({ error: 'Address required' });
  }
  
  const isPublic = is_public === true || is_public === 'true' || is_public === 1 ? 1 : 0;
  
  db.get('SELECT * FROM users WHERE token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Check if user already has a penpal profile
    db.get('SELECT * FROM celebrities WHERE user_id = ?', [user.id], (err, existing) => {
      if (existing) {
        // Update existing
        db.run(
          'UPDATE celebrities SET fanmail_address = ?, bio = ?, category = ?, is_public = ? WHERE user_id = ?',
          [fanmail_address, bio, category || 'fan', isPublic, user.id],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Failed to update profile' });
            }
            res.json({ 
              success: true, 
              celebrity_id: existing.id, 
              is_public: isPublic,
              message: isPublic ? 'Public profile updated!' : 'Private profile updated - only you can send letters to this address.'
            });
          }
        );
      } else {
        // Create new penpal profile
        db.run(
          `INSERT INTO celebrities (name, category, bio, fanmail_address, user_id, verified, popularity_score, is_public, created_by_user_id, relationship_type)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
          [user.display_name, category || 'fan', bio, fanmail_address, user.id, isPublic, user.id, 'self'],
          function(err) {
            if (err) {
              console.error('Penpal creation error:', err);
              return res.status(500).json({ error: 'Failed to create penpal profile' });
            }
            res.json({ 
              success: true, 
              celebrity_id: this.lastID, 
              is_public: isPublic,
              message: isPublic ? 'Welcome to Celebrity Penpal! Your public profile is live.' : 'Private profile created - only you can send letters here.'
            });
          }
        );
      }
    });
  });
});

// Add family member / loved one (private by default)
app.post('/api/add-family-member', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { name, fanmail_address, relationship_type, bio } = req.body;
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (!name || !fanmail_address) {
    return res.status(400).json({ error: 'Name and address required' });
  }
  
  db.get('SELECT * FROM users WHERE token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Create family member profile (always private - is_public = 0)
    db.run(
      `INSERT INTO celebrities (name, category, bio, fanmail_address, user_id, verified, popularity_score, is_public, created_by_user_id, relationship_type)
       VALUES (?, ?, ?, ?, NULL, 0, 0, 0, ?, ?)`,
      [name, 'family', bio || `${relationship_type || 'Family member'} of ${user.display_name}`, fanmail_address, user.id, relationship_type || 'family'],
      function(err) {
        if (err) {
          console.error('Family member creation error:', err);
          return res.status(500).json({ error: 'Failed to add family member' });
        }
        res.json({ 
          success: true, 
          celebrity_id: this.lastID,
          name: name,
          message: `${name} has been added to your private address book! You can now send them handwritten letters anytime.`
        });
      }
    );
  });
});

// Get user's penpal profile
app.get('/api/my-penpal-profile', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  db.get('SELECT * FROM users WHERE token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    db.get('SELECT * FROM celebrities WHERE user_id = ?', [user.id], (err, profile) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(profile || null);
    });
  });
});

// Get user's family members
app.get('/api/my-family-members', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  db.get('SELECT * FROM users WHERE token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    db.all(
      'SELECT * FROM celebrities WHERE created_by_user_id = ? AND relationship_type != "self" ORDER BY name',
      [user.id],
      (err, members) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(members || []);
      }
    );
  });
});

// Delete family member
app.delete('/api/family-member/:id', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const memberId = req.params.id;
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  db.get('SELECT * FROM users WHERE token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    db.run(
      'DELETE FROM celebrities WHERE id = ? AND created_by_user_id = ? AND relationship_type != "self"',
      [memberId, user.id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Family member not found' });
        }
        res.json({ success: true, message: 'Family member removed' });
      }
    );
  });
});

// Get letters received by logged-in user (their penpal profile)
app.get('/api/my-letters', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  db.get('SELECT * FROM users WHERE token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    db.get('SELECT id FROM celebrities WHERE user_id = ?', [user.id], (err, profile) => {
      if (err || !profile) {
        return res.json([]);
      }
      
      db.all(
        'SELECT l.*, c.name as celebrity_name FROM letters l JOIN celebrities c ON l.celebrity_id = c.id WHERE l.celebrity_id = ? ORDER BY l.created_at DESC',
        [profile.id],
        (err, letters) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.json(letters || []);
        }
      );
    });
  });
});

// API: Get celebrities (only public ones + user's own private ones)
app.get('/api/celebrities', (req, res) => {
  const { category, search, limit = 20 } = req.query;
  const token = req.headers.authorization?.replace('Bearer ', '');

  console.log('[api/celebrities] request', {
    category,
    search,
    limit,
    hasToken: Boolean(token)
  });

  const limitValue = Number.parseInt(limit, 10);
  const safeLimit = Number.isNaN(limitValue) ? 20 : Math.max(1, Math.min(limitValue, 100));

  let query = 'SELECT * FROM celebrities WHERE is_public = 1';
  const params = [];

  // Temporarily simplify query to isolate token-related errors.
  // Toggle back by setting CELEB_SIMPLE_QUERY=0 in the environment.
  const useSimpleQuery = process.env.CELEB_SIMPLE_QUERY !== '0';
  if (!useSimpleQuery && token) {
    // If user is logged in, also show their private profiles
    // MUST use parentheses around OR condition for proper SQL precedence
    query = 'SELECT * FROM celebrities WHERE (is_public = 1 OR created_by_user_id = (SELECT id FROM users WHERE token = ?))';
    params.push(token);
  }
  
  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }
  
  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  
  query += ' ORDER BY verified DESC, popularity_score DESC, name LIMIT ?';
  params.push(safeLimit);
  
  console.log('Executing query:', query);
  console.log('With params:', params);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database error in /api/celebrities:', err);
      logDbStatus('api/celebrities-error');
      db.get('SELECT COUNT(*) as count FROM celebrities', (countErr, row) => {
        if (countErr) {
          console.error('[api/celebrities-error] Count failed:', countErr);
        } else {
          console.log('[api/celebrities-error] Celebrity count:', row ? row.count : 'unknown');
        }
      });
      return res.status(500).json({ error: 'Database error', details: err.message });
    }
    res.json(rows);
  });
});

// API: Get single celebrity
app.get('/api/celebrities/:id', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  db.get('SELECT * FROM celebrities WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) return res.status(404).json({ error: 'Celebrity not found' });
    
    // Check if private profile belongs to logged-in user
    if (!row.is_public) {
      if (!token) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      db.get('SELECT id FROM users WHERE token = ?', [token], (err, user) => {
        if (err || !user || row.created_by_user_id !== user.id) {
          return res.status(404).json({ error: 'Not found' });
        }
        res.json(row);
      });
    } else {
      res.json(row);
    }
  });
});

// API: Create letter order
app.post('/api/letters', async (req, res) => {
  const { celebrity_id, customer_email, customer_name, message, handwriting_style, return_address, sender_name } = req.body;
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!celebrity_id || !customer_email || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Get celebrity details from database
  db.get('SELECT * FROM celebrities WHERE id = ?', [celebrity_id], async (err, celebrity) => {
    if (err || !celebrity) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    // Check if private profile - only creator can send
    if (!celebrity.is_public) {
      if (!token) {
        return res.status(403).json({ error: 'Cannot send to this recipient' });
      }
      
      const user = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM users WHERE token = ?', [token], (err, u) => {
          if (err) reject(err);
          else resolve(u);
        });
      });
      
      if (!user || celebrity.created_by_user_id !== user.id) {
        return res.status(403).json({ error: 'Cannot send to this recipient' });
      }
    }
    
    // Check if we have a valid address
    if (!celebrity.fanmail_address) {
      return res.status(400).json({ error: 'No address available for this recipient' });
    }
    
    try {
      // Save letter to database first
      const stmt = db.prepare(`
        INSERT INTO letters (celebrity_id, customer_email, customer_name, message, handwriting_style, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(celebrity_id, customer_email, customer_name || 'Anonymous', message, handwriting_style || 'casual', 'processing', async function(err) {
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
              preview_url: result.preview_url,
              message: `Your letter to ${celebrity.name} has been sent!`
            });
          } catch (hwError) {
            console.error('Handwrytten API error:', hwError);
            // Mark as pending manual processing
            db.run('UPDATE letters SET status = ? WHERE id = ?', ['pending', letter_id]);
            res.json({ 
              success: true, 
              letter_id: letter_id,
              status: 'pending',
              message: `Letter to ${celebrity.name} queued for processing`
            });
          }
        } else {
          // No Handwrytten credentials, mark as pending
          res.json({ 
            success: true, 
            letter_id: letter_id,
            status: 'pending',
            message: `Letter to ${celebrity.name} queued for processing`
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
      
      const stmt = db.prepare('INSERT OR IGNORE INTO celebrities (name, category, fanmail_address, verified, popularity_score, is_public, created_by_user_id, relationship_type) VALUES (?, ?, ?, 1, ?, 1, NULL, NULL)');
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
  logDbStatus('startup');
  
  // Seed after server starts
  setTimeout(seedDatabase, 1000);
});
