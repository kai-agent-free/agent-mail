const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Email credentials from environment or config
const IMAP_CONFIG = {
  user: process.env.EMAIL_USER || 'kai@kdn.agency',
  password: process.env.EMAIL_PASS || 'gdb_eky2xjb9XBV9gzy',
  host: 'imap.purelymail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

/**
 * Fetch emails for a specific mailbox (subaddress)
 */
async function fetchEmails(mailboxId, limit = 10) {
  return new Promise((resolve, reject) => {
    const imap = new Imap(IMAP_CONFIG);
    const emails = [];
    const targetAddress = `kai+${mailboxId}@kdn.agency`;
    
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }
        
        // Search for emails to this subaddress
        // Note: Some servers support HEADER search, others don't
        // Fallback: fetch recent and filter
        imap.search(['ALL'], (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }
          
          if (!results || results.length === 0) {
            imap.end();
            return resolve([]);
          }
          
          // Get last N emails
          const toFetch = results.slice(-Math.min(50, results.length));
          
          const f = imap.fetch(toFetch, {
            bodies: '',
            struct: true
          });
          
          f.on('message', (msg, seqno) => {
            msg.on('body', (stream, info) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  
                  // Check if email is for this mailbox
                  const toAddresses = parsed.to?.value || [];
                  const isForMailbox = toAddresses.some(addr => 
                    addr.address?.toLowerCase() === targetAddress.toLowerCase()
                  );
                  
                  if (isForMailbox) {
                    emails.push({
                      id: parsed.messageId || `msg-${seqno}`,
                      from: parsed.from?.text || 'unknown',
                      to: parsed.to?.text || '',
                      subject: parsed.subject || '(no subject)',
                      body: parsed.text || parsed.html || '',
                      html: parsed.html || null,
                      received_at: parsed.date?.toISOString() || new Date().toISOString()
                    });
                  }
                } catch (parseErr) {
                  console.error('Parse error:', parseErr);
                }
              });
            });
          });
          
          f.once('error', (err) => {
            console.error('Fetch error:', err);
          });
          
          f.once('end', () => {
            imap.end();
            // Return most recent first, limited
            const sorted = emails.sort((a, b) => 
              new Date(b.received_at) - new Date(a.received_at)
            );
            resolve(sorted.slice(0, limit));
          });
        });
      });
    });
    
    imap.once('error', (err) => {
      reject(err);
    });
    
    imap.connect();
  });
}

module.exports = { fetchEmails };
