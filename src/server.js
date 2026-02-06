const express = require('express');
const { initDb, getDb, saveDb } = require('./db');
const { verifyMoltbookKey } = require('./auth');
const { fetchEmails } = require('./imap');
const { sendEmail, verifySmtp } = require('./smtp');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const axios = require('axios');

const path = require('path');
const app = express();
app.use(express.json());

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'landing', 'index.html'));
});

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

// Extract verification codes from text
function extractCodes(text) {
  if (!text) return [];
  const patterns = [
    /\b(\d{4,8})\b/g,                          // 4-8 digit codes
    /code[:\s]+(\w{4,10})/gi,                  // "code: XXXX"
    /verification[:\s]+(\w{4,10})/gi,          // "verification: XXXX"
    /OTP[:\s]+(\d{4,8})/gi,                    // "OTP: XXXX"
    /pin[:\s]+(\d{4,8})/gi,                    // "PIN: XXXX"
  ];
  
  const codes = new Set();
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      codes.add(match[1]);
    }
  }
  return [...codes];
}

// Get emails
app.get('/api/mailbox/emails', authMiddleware, async (req, res) => {
  try {
    const { agent } = req;
    const limit = parseInt(req.query.limit) || 10;
    const codesOnly = req.query.codes === 'true';
    
    const emails = await fetchEmails(agent.mailbox_id, limit);
    
    // Add extracted codes to each email
    const enrichedEmails = emails.map(email => ({
      ...email,
      codes: extractCodes(email.body + ' ' + email.subject)
    }));
    
    if (codesOnly) {
      // Return only codes from latest email
      const latestCodes = enrichedEmails[0]?.codes || [];
      return res.json({ codes: latestCodes });
    }
    
    res.json({ emails: enrichedEmails });
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
    created_at: agent.created_at,
    webhook_url: agent.webhook_url || null
  });
});

// Set webhook URL
app.put('/api/mailbox/webhook', authMiddleware, (req, res) => {
  try {
    const { agent } = req;
    const { webhook_url } = req.body;
    
    // Validate URL
    if (webhook_url) {
      try {
        new URL(webhook_url);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid webhook URL' });
      }
    }
    
    const db = getDb();
    db.prepare('UPDATE agents SET webhook_url = ? WHERE id = ?').run(webhook_url || null, agent.id);
    
    res.json({
      success: true,
      webhook_url: webhook_url || null,
      message: webhook_url ? 'Webhook registered' : 'Webhook removed'
    });
  } catch (err) {
    console.error('Set webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete webhook
app.delete('/api/mailbox/webhook', authMiddleware, (req, res) => {
  try {
    const { agent } = req;
    const db = getDb();
    db.prepare('UPDATE agents SET webhook_url = NULL WHERE id = ?').run(agent.id);
    res.json({ success: true, message: 'Webhook removed' });
  } catch (err) {
    console.error('Delete webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============= EMAIL TEMPLATES =============
const EMAIL_TEMPLATES = {
  verification_request: {
    subject: 'Verification Request from {{agent_name}}',
    body: `Hello,

I am {{agent_name}}, an AI agent requesting verification access.

Purpose: {{purpose}}

My email: {{agent_email}}
Timestamp: {{timestamp}}

Please reply to this email to complete verification.

Best regards,
{{agent_name}}`
  },
  introduction: {
    subject: 'Introduction: {{agent_name}}',
    body: `Hello,

I am {{agent_name}}, an AI agent.

{{message}}

You can reach me at: {{agent_email}}

Best regards,
{{agent_name}}`
  },
  follow_up: {
    subject: 'Follow-up: {{subject}}',
    body: `Hello,

This is a follow-up regarding: {{subject}}

{{message}}

Best regards,
{{agent_name}}`
  }
};

// List available templates
app.get('/api/templates', (req, res) => {
  const templates = Object.keys(EMAIL_TEMPLATES).map(id => ({
    id,
    subject: EMAIL_TEMPLATES[id].subject,
    variables: extractTemplateVars(EMAIL_TEMPLATES[id].body + EMAIL_TEMPLATES[id].subject)
  }));
  res.json({ templates });
});

// Extract {{variable}} placeholders from template
function extractTemplateVars(text) {
  const matches = text.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

// Fill template with variables
function fillTemplate(template, vars) {
  let subject = template.subject;
  let body = template.body;
  
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(regex, value);
    body = body.replace(regex, value);
  }
  
  return { subject, body };
}

// Send email using template
app.post('/api/mailbox/send-template', authMiddleware, async (req, res) => {
  try {
    const { agent } = req;
    const { to, template_id, variables } = req.body;
    
    if (!to || !template_id) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, template_id' 
      });
    }
    
    const template = EMAIL_TEMPLATES[template_id];
    if (!template) {
      return res.status(400).json({ 
        error: 'Unknown template',
        available: Object.keys(EMAIL_TEMPLATES)
      });
    }
    
    // Auto-fill agent variables
    const vars = {
      agent_name: agent.moltbook_name || 'AI Agent',
      agent_email: agent.email,
      timestamp: new Date().toISOString(),
      ...variables
    };
    
    const { subject, body } = fillTemplate(template, vars);
    
    // Use existing send logic
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const sendCount = agent.sends_today || 0;
    const lastSendDate = agent.last_send_date;
    const currentSends = (lastSendDate === today) ? sendCount : 0;
    
    if (currentSends >= 10) {
      return res.status(429).json({ 
        error: 'Daily send limit reached (10 emails/day)',
        resets_at: `${today}T23:59:59Z`
      });
    }
    
    const result = await sendEmail(agent.mailbox_id, { to, subject, body });
    
    db.prepare(`
      UPDATE agents 
      SET sends_today = ?, last_send_date = ? 
      WHERE id = ?
    `).run(currentSends + 1, today, agent.id);
    
    res.json({
      success: true,
      message: 'Template email sent',
      template_used: template_id,
      ...result,
      sends_remaining: 10 - (currentSends + 1)
    });
  } catch (err) {
    console.error('Send template error:', err);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

// Send email
app.post('/api/mailbox/send', authMiddleware, async (req, res) => {
  try {
    const { agent } = req;
    const { to, subject, body, html } = req.body;
    
    if (!to || !subject || !body) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, body' 
      });
    }
    
    // Rate limiting: track sends per agent
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const sendCount = agent.sends_today || 0;
    const lastSendDate = agent.last_send_date;
    
    // Reset counter if new day
    const currentSends = (lastSendDate === today) ? sendCount : 0;
    
    // Limit: 10 emails per day per agent (MVP)
    if (currentSends >= 10) {
      return res.status(429).json({ 
        error: 'Daily send limit reached (10 emails/day)',
        resets_at: `${today}T23:59:59Z`
      });
    }
    
    const result = await sendEmail(agent.mailbox_id, { to, subject, body, html });
    
    // Update send counter
    db.prepare(`
      UPDATE agents 
      SET sends_today = ?, last_send_date = ? 
      WHERE id = ?
    `).run(currentSends + 1, today, agent.id);
    
    res.json({
      success: true,
      message: 'Email sent',
      ...result,
      sends_remaining: 10 - (currentSends + 1)
    });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

// Webhook polling service
async function pollWebhooks() {
  try {
    const db = getDb();
    const agents = db.prepare('SELECT * FROM agents WHERE webhook_url IS NOT NULL').all();
    
    for (const agent of agents) {
      try {
        const emails = await fetchEmails(agent.mailbox_id, 5);
        
        // Find new emails (not seen before)
        const newEmails = emails.filter(email => {
          if (!agent.last_email_id) return true;
          return email.id !== agent.last_email_id && 
                 new Date(email.received_at) > new Date(agent.last_check || 0);
        });
        
        if (newEmails.length > 0) {
          // Send webhook for each new email
          for (const email of newEmails) {
            try {
              await axios.post(agent.webhook_url, {
                event: 'email.received',
                mailbox_id: agent.mailbox_id,
                email: {
                  id: email.id,
                  from: email.from,
                  to: email.to,
                  subject: email.subject,
                  body: email.body,
                  received_at: email.received_at
                }
              }, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
              });
              console.log(`Webhook sent to ${agent.moltbook_name} for email: ${email.subject}`);
            } catch (webhookErr) {
              console.error(`Webhook failed for ${agent.moltbook_name}:`, webhookErr.message);
            }
          }
          
          // Update last seen email
          const latestEmail = emails[0];
          db.prepare('UPDATE agents SET last_email_id = ?, last_check = datetime("now") WHERE id = ?')
            .run(latestEmail.id, agent.id);
        }
      } catch (agentErr) {
        console.error(`Poll error for ${agent.moltbook_name}:`, agentErr.message);
      }
    }
  } catch (err) {
    console.error('Webhook poll error:', err);
  }
}

// ============= SOLANA PAY INTEGRATION =============
const solanaPay = require('./solana-pay');

// Get pricing info
app.get('/api/pay/prices', (req, res) => {
  res.json({
    prices: solanaPay.PRICES,
    currency: 'USDC',
    network: 'solana',
    recipient: solanaPay.RECIPIENT,
  });
});

// Create payment request
app.post('/api/pay/request', (req, res) => {
  try {
    const { type, agent_id } = req.body;
    
    if (!type) {
      return res.status(400).json({ error: 'Payment type required' });
    }
    
    const agentId = agent_id || 'anonymous';
    const payment = solanaPay.createPaymentRequest(type, agentId);
    
    // Store payment request for tracking
    const db = getDb();
    db.prepare(`
      INSERT INTO payments (reference, type, agent_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', datetime('now'))
    `).run(payment.reference, type, agentId, payment.amount);
    
    res.json(payment);
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Check payment status
app.get('/api/pay/status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    // Check on-chain
    const status = await solanaPay.verifyPayment(reference);
    
    // Update DB if confirmed
    if (status.verified) {
      const db = getDb();
      db.prepare(`
        UPDATE payments 
        SET status = 'confirmed', signature = ?, confirmed_at = datetime('now')
        WHERE reference = ?
      `).run(status.signature, reference);
    }
    
    res.json(status);
  } catch (err) {
    console.error('Payment status error:', err);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// Create paid mailbox (after payment confirmed)
app.post('/api/mailbox/create-paid', async (req, res) => {
  try {
    const { reference, agent_name } = req.body;
    
    if (!reference) {
      return res.status(400).json({ error: 'Payment reference required' });
    }
    
    // Verify payment
    const status = await solanaPay.verifyPayment(reference);
    if (!status.verified) {
      return res.status(402).json({ 
        error: 'Payment not confirmed', 
        status: status.status 
      });
    }
    
    const db = getDb();
    
    // Check if payment was already used
    const payment = db.prepare('SELECT * FROM payments WHERE reference = ?').get(reference);
    if (payment?.used) {
      return res.status(400).json({ error: 'Payment already used' });
    }
    
    // Create mailbox
    const mailboxId = uuidv4().slice(0, 8);
    const email = `kai+${mailboxId}@kdn.agency`;
    const apiKey = generateApiKey();
    const name = agent_name || `solana-${mailboxId}`;
    
    db.prepare(`
      INSERT INTO agents (id, moltbook_id, moltbook_name, mailbox_id, email, api_key, created_at, paid)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1)
    `).run(uuidv4(), `solana-${reference.slice(0,8)}`, name, mailboxId, email, apiKey);
    
    // Mark payment as used
    db.prepare('UPDATE payments SET used = 1 WHERE reference = ?').run(reference);
    
    res.json({
      email,
      mailbox_id: mailboxId,
      api_key: apiKey,
      paid: true,
      payment_signature: status.signature,
      message: 'Paid mailbox created successfully'
    });
  } catch (err) {
    console.error('Create paid mailbox error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
async function main() {
  await initDb();
  
  app.listen(PORT, () => {
    console.log(`Agent Mail API running on port ${PORT}`);
    console.log(`Base email: ${BASE_EMAIL}`);
    console.log(`Solana Pay enabled - recipient: ${solanaPay.RECIPIENT}`);
  });
  
  // Start webhook polling (every 30 seconds)
  console.log('Starting webhook polling service...');
  setInterval(pollWebhooks, 30000);
  // Initial poll after 5 seconds
  setTimeout(pollWebhooks, 5000);
}

main().catch(console.error);
