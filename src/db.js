const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let dbPath = null;

async function initDb() {
  const SQL = await initSqlJs();
  
  dbPath = path.join(__dirname, '..', 'data', 'agent-mail.db');
  
  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Load existing database or create new
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      moltbook_id TEXT UNIQUE,
      moltbook_name TEXT,
      mailbox_id TEXT UNIQUE,
      email TEXT UNIQUE,
      api_key TEXT UNIQUE,
      created_at TEXT,
      last_check TEXT,
      webhook_url TEXT,
      last_email_id TEXT
    )
  `);
  
  // Create payments table for Solana Pay
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      reference TEXT PRIMARY KEY,
      type TEXT,
      agent_id TEXT,
      amount REAL,
      status TEXT DEFAULT 'pending',
      signature TEXT,
      created_at TEXT,
      confirmed_at TEXT,
      used INTEGER DEFAULT 0
    )
  `);
  
  // Migration: add webhook columns if missing
  try {
    db.run(`ALTER TABLE agents ADD COLUMN webhook_url TEXT`);
  } catch (e) { /* column exists */ }
  try {
    db.run(`ALTER TABLE agents ADD COLUMN last_email_id TEXT`);
  } catch (e) { /* column exists */ }
  try {
    db.run(`ALTER TABLE agents ADD COLUMN sends_today INTEGER DEFAULT 0`);
  } catch (e) { /* column exists */ }
  try {
    db.run(`ALTER TABLE agents ADD COLUMN last_send_date TEXT`);
  } catch (e) { /* column exists */ }
  try {
    db.run(`ALTER TABLE agents ADD COLUMN paid INTEGER DEFAULT 0`);
  } catch (e) { /* column exists */ }
  
  saveDb();
  console.log('Database initialized');
  return db;
}

function saveDb() {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return {
    prepare: (sql) => ({
      get: (...params) => {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return null;
      },
      run: (...params) => {
        db.run(sql, params);
        saveDb();
      },
      all: (...params) => {
        const results = [];
        const stmt = db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      }
    })
  };
}

module.exports = { initDb, getDb, saveDb };
