const express = require('express');
const { initDb, getDb } = require('./db');
const { verifyMoltbookKey } = require('./auth');
const { fetchEmails } = require('./imap');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3456;
const BASE_EMAIL = 'kai@kdn.agency';

// Generate API key
function generateApiKey() {
  return 'am_' + crypto.randomBytes(32).toString('hex');
}

// Auth middleware
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const apiKey = authHeader.slice(7);
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey);
  
  if (!agent) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  req.agent = agent;
  next();
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'agent-mail' });
});

// Create mailbox
app.post('/api/mailbox/create', async (req, res) => {
  try {
    const { moltbook_key } = req.body;
    
    if (!moltbook_key) {
      return res.status(400).json({ error: 'moltbook_key is required' });
    }
    
    // Verify Moltbook key
    const moltbookAgent = await verifyMoltbookKey(moltbook_key);
    if (!moltbookAgent) {
      return res.status(401).json({ error: 'Invalid Moltbook API key' });
    }
    
    const db = getDb();
    
    // Check if agent already has mailbox
    const existing = db.prepare('SELECT * FROM agents WHERE moltbook_id = ?').get(moltbookAgent.id);
    if (existing) {
      return res.json({
        email: existing.email,
        mailbox_id: existing.mailbox_id,
        api_key: existing.api_key,
        message: 'Mailbox already exists'
      });
    }
    
    // Create new mailbox
    const mailboxId = uuidv4().slice(0, 8);
    const email = `kai+${mailboxId}@kdn.agency`;
    const apiKey = generateApiKey();
    
    db.prepare(`
      INSERT INTO agents (id, moltbook_id, moltbook_name, mailbox_id, email, api_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(uuidv4(), moltbookAgent.id, moltbookAgent.name, mailboxId, email, apiKey);
    
    res.json({
      email,
      mailbox_id: mailboxId,
      api_key: apiKey,
      message: 'Mailbox created successfully'
    });
  } catch (err) {
    console.error('Create mailbox error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get emails
app.get('/api/mailbox/emails', authMiddleware, async (req, res) => {
  try {
    const { agent } = req;
    const limit = parseInt(req.query.limit) || 10;
    
    const emails = await fetchEmails(agent.mailbox_id, limit);
    
    res.json({ emails });
  } catch (err) {
    console.error('Fetch emails error:', err);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get mailbox info
app.get('/api/mailbox', authMiddleware, (req, res) => {
  const { agent } = req;
  res.json({
    email: agent.email,
    mailbox_id: agent.mailbox_id,
    moltbook_name: agent.moltbook_name,
    created_at: agent.created_at
  });
});

// Start server
async function main() {
  await initDb();
  
  app.listen(PORT, () => {
    console.log(`Agent Mail API running on port ${PORT}`);
    console.log(`Base email: ${BASE_EMAIL}`);
  });
}

main().catch(console.error);
