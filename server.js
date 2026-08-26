import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ── Cheese Database Loader ───────────────────────────────────────────
let cheeses = [];

function loadCheeseDataset() {
  const possiblePaths = [
    path.join(__dirname, 'data', 'cheeses.json'),
    path.join(__dirname, 'cheese-backend', 'dataset', 'cheeses.csv'),
    path.join(__dirname, 'cheese-backend', 'dataset', 'cheese_details.csv'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        if (p.endsWith('.json')) {
          cheeses = JSON.parse(fs.readFileSync(p, 'utf-8'));
          console.log(`Loaded ${cheeses.length} cheeses from JSON`);
          return;
        } else if (p.endsWith('.csv')) {
          const raw = fs.readFileSync(p, 'utf-8');
          cheeses = parseCSV(raw);
          console.log(`Loaded ${cheeses.length} cheeses from CSV`);
          // Save to data/cheeses.json for faster subsequent loads & persistence
          try {
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(path.join(dataDir, 'cheeses.json'), JSON.stringify(cheeses, null, 2));
          } catch (e) {
            console.error('Could not cache cheeses.json:', e);
          }
          return;
        }
      } catch (err) {
        console.error(`Failed loading ${p}:`, err);
      }
    }
  }
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  
  const headers = parseCSVLine(lines[0]);
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length === headers.length || row.length > 1) {
      const obj = {};
      headers.forEach((h, idx) => {
        const val = (row[idx] || '').trim();
        obj[h] = val === 'NA' ? '' : val;
      });
      if (obj.cheese || obj.url) {
        records.push(obj);
      }
    }
  }
  return records;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

loadCheeseDataset();

// Helper to search cheeses
function searchCheeseContext(query, limit = 5) {
  if (!cheeses.length) return '';
  const qLower = query.toLowerCase();
  const tokens = qLower.split(/\s+/).filter(t => t.length > 2);

  const scored = cheeses.map(c => {
    let score = 0;
    const name = (c.cheese || '').toLowerCase();
    const country = (c.country || '').toLowerCase();
    const type = (c.type || '').toLowerCase();
    const flavor = (c.flavor || '').toLowerCase();
    const texture = (c.texture || '').toLowerCase();
    const milk = (c.milk || '').toLowerCase();

    if (name && qLower.includes(name)) score += 20;
    if (name && name.includes(qLower)) score += 15;
    
    tokens.forEach(tok => {
      if (name.includes(tok)) score += 8;
      if (country.includes(tok)) score += 4;
      if (type.includes(tok)) score += 3;
      if (flavor.includes(tok)) score += 2;
      if (texture.includes(tok)) score += 2;
      if (milk.includes(tok)) score += 2;
    });

    return { cheese: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter(s => s.score > 0).slice(0, limit).map(s => s.cheese);
  
  if (top.length === 0) {
    // If no direct keyword match, grab 3 random interesting cheeses
    const sample = [...cheeses].sort(() => Math.random() - 0.5).slice(0, 3);
    return sample.map(formatCheeseEntry).join('\n\n');
  }

  return top.map(formatCheeseEntry).join('\n\n');
}

function formatCheeseEntry(c) {
  const fields = [];
  if (c.cheese) fields.push(`Cheese: ${c.cheese}`);
  if (c.milk) fields.push(`Milk: ${c.milk}`);
  if (c.country) fields.push(`Country: ${c.country}`);
  if (c.region) fields.push(`Region: ${c.region}`);
  if (c.type) fields.push(`Type: ${c.type}`);
  if (c.texture) fields.push(`Texture: ${c.texture}`);
  if (c.flavor) fields.push(`Flavor: ${c.flavor}`);
  if (c.aroma) fields.push(`Aroma: ${c.aroma}`);
  if (c.rind) fields.push(`Rind: ${c.rind}`);
  if (c.synonyms) fields.push(`Synonyms: ${c.synonyms}`);
  return fields.join(' | ');
}

// ── Smart Offline Fallback Generator ─────────────────────────────────
function generateLocalCheeseResponse(message) {
  const q = message.toLowerCase().trim();

  // Jokes
  if (q.includes('joke') || q.includes('pun')) {
    const jokes = [
      "What did the cheese say when it looked in the mirror? Halloumi! (Hello me!)",
      "Why did the cheese get promoted? Because it did a gouda job!",
      "What kind of cheese is made backwards? Edam!",
      "How do you get a mouse to smile? Say cheese!",
      "What is a cheese lover's favorite music genre? R&Brie!",
      "Why should you never trust a cheese with a secret? Because it might be fondue-ing something shady!",
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // Random Fact
  if (q.includes('fact') || q.includes('surprising')) {
    const facts = [
      "Did you know? Casu Marzu is an Italian pecorino famous for containing live cheese skipper larvae, celebrated traditionally in Sardinia.",
      "The holes in Swiss cheese (Emmental) are called 'eyes', created by carbon dioxide bubbles released by Propionibacterium freudenreichii bacteria during aging!",
      "Over 4,000 distinct cheese varieties exist worldwide, with Greece and France consuming the highest volume per capita.",
      "Queen Victoria of England was given a giant wheel of Cheddar cheese as a wedding gift that weighed over 1,000 pounds (450 kg)!",
      "Parmigiano-Reggiano is so valuable in northern Italy that several banks accept whole wheels as loan collateral in specialized climate-controlled vaults.",
    ];
    return facts[Math.floor(Math.random() * facts.length)];
  }

  // Cheese Search / Pairing / Description
  const matchedCheeses = cheeses.filter(c => {
    const n = (c.cheese || '').toLowerCase();
    return n && (q.includes(n) || (n.length > 4 && q.includes(n.slice(0, -1))));
  });

  if (matchedCheeses.length > 0) {
    const c = matchedCheeses[0];
    let response = `🧀 **${c.cheese}**\n\n`;
    if (c.country) response += `• **Origin:** ${c.country}${c.region ? ` (${c.region})` : ''}\n`;
    if (c.milk) response += `• **Milk:** ${c.milk}\n`;
    if (c.type) response += `• **Type & Texture:** ${c.type}${c.texture ? `, ${c.texture}` : ''}\n`;
    if (c.flavor) response += `• **Flavor Profile:** ${c.flavor}\n`;
    if (c.aroma) response += `• **Aroma:** ${c.aroma}\n`;
    if (c.rind) response += `• **Rind:** ${c.rind}\n`;

    if (q.includes('pair') || q.includes('wine') || q.includes('food')) {
      response += `\n🍷 **Pairing Suggestions:**\nPairs exquisitely with crusty sourdough, fresh figs or fruit preserves, and a crisp white wine or medium-bodied red that complements its ${c.flavor || 'creamy'} notes.`;
    } else if (q.includes('substitute') || q.includes('sub')) {
      response += `\n⇌ **Substitutions:**\nLook for other ${c.type || 'similar'} cheeses made with ${c.milk || 'similar'} milk and comparable moisture content.`;
    }
    return response;
  }

  // General helpful response
  return `Bonjour! As your Cheese Master, I recommend exploring our extensive collection of artisanal cheeses from around the world. Try asking me about specific cheeses like **Brie, Cheddar, Roquefort, Manchego, Gouda, or Burrata**, or use commands like **/quiz, /cheeseme, /pair, or /board**!`;
}

// ── API Routes ────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/chat', async (req, res) => {
  const message = req.body?.message;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ detail: 'Message cannot be empty' });
  }

  const trimmed = message.trim();
  const context = searchCheeseContext(trimmed);

  // 1. Try Gemini API if GEMINI_API_KEY is available
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are Cheese Master, a friendly, witty, and knowledgeable French-inspired cheese expert and master affineur.
Answer the user's question with charm, enthusiasm, and accuracy.
Use the cheese knowledge provided below when relevant. If the context doesn't cover everything, use your expert cheese knowledge. Keep answers concise, delightful, and well-formatted.

Cheese knowledge database context:
${context || 'No specific database match found.'}

User Question:
${trimmed}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const reply = response.text || '';
      if (reply) {
        return res.json({ reply });
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back:', err.message);
    }
  }

  // 2. Try OpenAI if OPENAI_API_KEY is configured
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are Cheese Master, a friendly and knowledgeable cheese expert. Answer questions using the cheese knowledge provided below.\n\nCheese knowledge:\n${context}`
            },
            { role: 'user', content: trimmed }
          ]
        })
      });
      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        return res.json({ reply: data.choices[0].message.content });
      }
    } catch (err) {
      console.warn('OpenAI API call failed, falling back:', err.message);
    }
  }

  // 3. Fallback to local intelligent cheese knowledge responder
  const localReply = generateLocalCheeseResponse(trimmed);
  return res.json({ reply: localReply });
});

// Alias /api/chat as well
app.post('/api/chat', (req, res) => {
  req.url = '/chat';
  app.handle(req, res);
});

// ── Static Files Serving ──────────────────────────────────────────────
const docsPath = path.join(__dirname, 'docs');
app.use(express.static(docsPath));

// Also serve cheese images folder if requested directly
const cheeseBackendFolder = path.join(__dirname, 'cheese-backend');
if (fs.existsSync(cheeseBackendFolder)) {
  app.use('/cheese-backend', express.static(cheeseBackendFolder));
}

app.use((req, res) => {
  res.sendFile(path.join(docsPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧀 Cheese Master server running on http://0.0.0.0:${PORT}`);
});
