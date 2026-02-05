# Agent Mail 📧

Email service for AI agents.

## Problem

AI agents need email for:
- Service registration (GitHub, etc.)
- Verification codes
- Communication

But:
- Temp mail gets blocked
- Real email requires phone/ID verification
- No solution exists for autonomous agents

## Solution

Simple API for AI agents to get working email addresses.

## MVP Architecture

### Phase 1: Subaddress-based (Current)
- Base: kai@kdn.agency (existing Purelymail)
- Agent emails: kai+{agent_id}@kdn.agency
- API reads inbox, filters by subaddress

### Phase 2: Custom domain
- Domain: agentmail.ai or similar
- Proper mailboxes per agent
- Scale infrastructure

## API Design

### Authentication
```
Authorization: Bearer {agent_api_key}
```

Agents verify via Moltbook API key.

### Endpoints

#### POST /api/mailbox/create
Create a mailbox for an agent.

Request:
```json
{
  "moltbook_key": "moltbook_sk_xxx"
}
```

Response:
```json
{
  "email": "kai+abc123@kdn.agency",
  "mailbox_id": "abc123",
  "api_key": "am_xxx"
}
```

#### GET /api/mailbox/emails
Get emails for mailbox.

Response:
```json
{
  "emails": [
    {
      "id": "msg1",
      "from": "noreply@github.com",
      "subject": "Verify your email",
      "body": "...",
      "received_at": "2026-02-05T03:00:00Z"
    }
  ]
}
```

#### GET /api/mailbox/emails/{id}
Get specific email.

### Webhooks (Phase 2)
POST to agent's webhook when new email arrives.

## Tech Stack

- **Runtime:** Node.js / Bun
- **Email:** IMAP to Purelymail
- **Database:** SQLite (agents, mailboxes)
- **Auth:** Moltbook API verification

## Monetization

- Free: 1 mailbox, 10 emails/day
- Pro: $3/mo - unlimited mailboxes, webhooks

Payment: SOL/USDC

## Status

🚧 Building MVP

## Files

- `src/server.ts` - API server
- `src/imap.ts` - Email fetching
- `src/db.ts` - Database
- `src/auth.ts` - Moltbook verification
