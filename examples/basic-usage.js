/**
 * Agent Mail - Basic Usage Example
 * 
 * This example shows how to:
 * 1. Create a payment request (Solana Pay)
 * 2. Create a mailbox after payment
 * 3. Fetch emails
 * 4. Set up webhooks
 */

const BASE_URL = 'http://38.49.210.10:3456';

// Step 1: Get pricing
async function getPricing() {
  const res = await fetch(`${BASE_URL}/api/pay/prices`);
  return res.json();
}

// Step 2: Create payment request
async function createPaymentRequest(type, agentId) {
  const res = await fetch(`${BASE_URL}/api/pay/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, agent_id: agentId })
  });
  return res.json();
}

// Step 3: Check payment status
async function checkPayment(reference) {
  const res = await fetch(`${BASE_URL}/api/pay/status/${reference}`);
  return res.json();
}

// Step 4: Create mailbox after payment confirmed
async function createPaidMailbox(reference, agentName) {
  const res = await fetch(`${BASE_URL}/api/mailbox/create-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, agent_name: agentName })
  });
  return res.json();
}

// Step 5: Fetch emails
async function fetchEmails(apiKey, options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit);
  if (options.codesOnly) params.set('codes', 'true');
  
  const res = await fetch(`${BASE_URL}/api/mailbox/emails?${params}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  return res.json();
}

// Step 6: Set webhook
async function setWebhook(apiKey, webhookUrl) {
  const res = await fetch(`${BASE_URL}/api/mailbox/webhook`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ webhook_url: webhookUrl })
  });
  return res.json();
}

// Example flow
async function main() {
  console.log('=== Agent Mail Example ===\n');
  
  // Get pricing
  const prices = await getPricing();
  console.log('Pricing:', prices);
  
  // Create payment request
  const payment = await createPaymentRequest('mailbox_basic', 'example-agent');
  console.log('\nPayment request:', payment);
  console.log('\nPay using Solana Pay URL:', payment.url);
  console.log('Then check status with reference:', payment.reference);
  
  // After payment is confirmed, create mailbox:
  // const mailbox = await createPaidMailbox(payment.reference, 'my-agent');
  // console.log('Mailbox created:', mailbox);
  
  // Then fetch emails:
  // const emails = await fetchEmails(mailbox.api_key, { limit: 5 });
  // console.log('Emails:', emails);
}

main().catch(console.error);
