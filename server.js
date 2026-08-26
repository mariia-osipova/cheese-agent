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

  // 1. Jokes
  if (q.includes('joke') || q.includes('pun')) {
    const jokes = [
      "What did the cheese say when it looked in the mirror? Halloumi! (Hello me!)",
      "Why did the cheese get promoted? Because it did a gouda job!",
      "What kind of cheese is made backwards? Edam!",
      "How do you get a mouse to smile? Say cheese!",
      "What is a cheese lover's favorite music genre? R&Brie!",
      "Why should you never trust a cheese with a secret? Because it might be fondue-ing something shady!",
      "What did the parmesan say when someone grated it? Thanks, that was shred-tastic!",
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // 2. Random Fact
  if (q.includes('fact') || q.includes('surprising') || q.includes('little-known')) {
    const facts = [
      "Did you know? Casu Marzu is an Italian pecorino famous for containing live cheese skipper larvae, celebrated traditionally in Sardinia.",
      "The holes in Swiss cheese (Emmental) are called 'eyes', created by carbon dioxide bubbles released by Propionibacterium freudenreichii bacteria during aging!",
      "Over 4,000 distinct cheese varieties exist worldwide, with Greece and France consuming the highest volume per capita.",
      "Queen Victoria of England was given a giant wheel of Cheddar cheese as a wedding gift that weighed over 1,000 pounds (450 kg)!",
      "Parmigiano-Reggiano is so valuable in northern Italy that several banks accept whole wheels as loan collateral in specialized climate-controlled vaults.",
      "In 2014, scientists found cheese remnants in northwestern China's Taklamakan Desert dating back to 1615 BC, making it the oldest preserved cheese ever discovered.",
    ];
    return facts[Math.floor(Math.random() * facts.length)];
  }

  // 3. Cheese Board
  if (q.includes('cheese board') || q.includes('curated cheese board') || q.includes('board:')) {
    const fresh = cheeses.find(c => (c.type || '').toLowerCase().includes('soft') || (c.texture || '').toLowerCase().includes('soft')) || { cheese: 'Brie de Meaux', country: 'France' };
    const hard = cheeses.find(c => (c.type || '').toLowerCase().includes('hard') || (c.texture || '').toLowerCase().includes('firm')) || { cheese: 'Aged Comté (18 mo)', country: 'France' };
    const blue = cheeses.find(c => (c.cheese || '').toLowerCase().includes('roquefort') || (c.cheese || '').toLowerCase().includes('gorgonzola')) || { cheese: 'Roquefort', country: 'France' };
    const goat = cheeses.find(c => (c.milk || '').toLowerCase().includes('goat')) || { cheese: 'Valençay', country: 'France' };

    return `🧀 **The Affineur's Curated Tasting Board**

1. **The Creamy Opener:** *${fresh.cheese}* (${fresh.country || 'France'})
   • *Notes:* Rich, buttery, velvety melt.
2. **The Tangy Goat:** *${goat.cheese}* (${goat.country || 'France'})
   • *Notes:* Citrusy, floral, crisp minerality.
3. **The Aged Alpine/Firm:** *${hard.cheese}* (${hard.country || 'Europe'})
   • *Notes:* Nutty, browned butter, crystalline crunch.
4. **The Pungent Blue:** *${blue.cheese}* (${blue.country || 'France'})
   • *Notes:* Spicy, salty, bold blue finish.

🍇 **Accompaniments:** Fresh mission figs, marcona almonds, honeycomb drizzle, cornichons, and crusty sourdough baguette slices.
🍷 **Wine Pairing:** A crisp Crémant or Champagne cuts cleanly through the fats across the entire board!`;
  }

  // 4. In Season
  if (q.includes('in season') || q.includes('peak right now') || q.includes('seasonal picks')) {
    return `🌿 **Cheeses at Their Peak Right Now**

1. **Vacherin Mont d'Or (Jura, France / Switzerland)**
   • *Profile:* Wrapped in spruce bark, spoonably luscious with woodsy, cellar notes.
2. **Fresh Farmhouse Chèvre (Loire Valley, France)**
   • *Profile:* Bright, milky, grassy freshness reflecting spring and summer alpine pastures.
3. **Beaufort d'Alpage (Savoie, France)**
   • *Profile:* Made exclusively from summer alpine milk; dense, floral, and deeply complex.
4. **Ossau-Iraty (Basque Country, France/Spain)**
   • *Profile:* Pure ewe's milk cheese with toasted hazelnut, caramel, and olive herbal undertones.`;
  }

  // 5. Compare two cheeses
  if (q.includes('compare') && (q.includes('side by side') || q.includes(' and '))) {
    const matched = cheeses.filter(c => c.cheese && q.includes(c.cheese.toLowerCase())).slice(0, 2);
    if (matched.length >= 2) {
      const a = matched[0];
      const b = matched[1];
      return `⚖️ **Side-by-Side Comparison: ${a.cheese} vs. ${b.cheese}**

• **Origin:** ${a.cheese} is from ${a.country || 'Europe'}${a.region ? ` (${a.region})` : ''}, whereas ${b.cheese} hails from ${b.country || 'Europe'}${b.region ? ` (${b.region})` : ''}.
• **Milk & Texture:** ${a.cheese} uses ${a.milk || 'traditional'} milk (${a.texture || a.type || 'distinct'}), while ${b.cheese} is made from ${b.milk || 'traditional'} milk (${b.texture || b.type || 'distinct'}).
• **Flavor Profiles:** ${a.cheese} features ${a.flavor || 'rich'} notes with ${a.aroma || 'delightful'} aromas, compared to ${b.cheese}'s ${b.flavor || 'bold'} character.
• **The Verdict:** Choose **${a.cheese}** if you want elegance and classic character, or **${b.cheese}** for a different regional adventure!`;
    }
  }

  // 6. Country exploration
  if (q.includes('cheese culture of') || q.includes('by country')) {
    const countries = ['france', 'italy', 'spain', 'switzerland', 'united kingdom', 'england', 'greece', 'germany', 'netherlands', 'usa'];
    const foundCountry = countries.find(c => q.includes(c));
    if (foundCountry) {
      const countryCheeses = cheeses.filter(c => (c.country || '').toLowerCase().includes(foundCountry)).slice(0, 5);
      const names = countryCheeses.map(c => `• **${c.cheese}** (${c.type || 'Artisanal'}, ${c.milk || 'dairy'} milk)`).join('\n');
      return `🌍 **The Cheese Heritage of ${foundCountry.toUpperCase()}**

This region holds centuries of affineur traditions and protected terroir designations.

🏆 **Iconic Varieties to Explore:**
${names || '• Artisanal mountain, washed rind, and pasture cheeses.'}

💡 **Affineur Tip:** Start with younger wheels to understand the milk profile before progressing to mature, cave-aged reserves!`;
    }
  }

  // 7. Emoji description
  if (q.includes('using only emojis') || q.includes('describe') && q.includes('emoji')) {
    const matched = cheeses.filter(c => c.cheese && q.includes(c.cheese.toLowerCase()))[0];
    const name = matched ? matched.cheese : 'Cheese';
    return `✨ **${name} in Emojis:**

🧀 🐄 🌿 🥖 🍷 🏔️ 🪵 🕯️ 😋

*Translation: Pure pastoral milk, aged patiently in mountain caves, best savored alongside crusty bread and fine wine!*`;
  }

  // 8. Recipe
  if (q.includes('recipe where') || q.includes('recipe')) {
    const matched = cheeses.filter(c => c.cheese && q.includes(c.cheese.toLowerCase()))[0];
    const name = matched ? matched.cheese : 'Artisanal Cheese';
    return `🍳 **Warm ${name} Tartine with Caramelized Onions & Thyme**

• **Prep Time:** 15 mins | **Cook Time:** 12 mins
• **Ingredients:** Thick slices of rustic sourdough, 150g ${name}, 2 yellow onions (slowly caramelized), fresh thyme sprigs, drizzle of wildflower honey, flaky sea salt.
• **Steps:**
  1. Toast sourdough lightly and rub with a halved garlic clove.
  2. Spread a generous mound of sweet caramelized onions over each slice.
  3. Layer thick slices of ${name} on top.
  4. Broil for 3–4 minutes until bubbly and golden around the edges.
  5. Garnish with fresh thyme leaves and a golden honey drizzle. Serve immediately!`;
  }

  // 9. Specific Cheese Search / Pairing / Description / Origin / Substitute
  // Search with token-level and substring flexibility
  let matchedCheeses = cheeses.filter(c => {
    const n = (c.cheese || '').toLowerCase();
    return n && (q.includes(n) || (n.length > 4 && q.includes(n.slice(0, -1))));
  });

  if (matchedCheeses.length === 0) {
    const qTokens = q.split(/\s+/).filter(t => t.length > 3 && !['about', 'cheese', 'where', 'whats', 'tell', 'origin', 'history', 'tasting', 'notes', 'rich', 'give', 'evocative', 'substitutes', 'best'].includes(t));
    matchedCheeses = cheeses.filter(c => {
      const n = (c.cheese || '').toLowerCase();
      return qTokens.some(tok => n.includes(tok));
    });
  }

  if (matchedCheeses.length > 0) {
    const c = matchedCheeses[0];
    let response = `🧀 **${c.cheese}**\n\n`;
    if (c.country) response += `• **Origin & Provenance:** ${c.country}${c.region ? ` (${c.region})` : ''}\n`;
    if (c.milk) response += `• **Milk:** ${c.milk}\n`;
    if (c.type) response += `• **Type & Texture:** ${c.type}${c.texture ? `, ${c.texture}` : ''}\n`;
    if (c.flavor) response += `• **Flavor Profile:** ${c.flavor}\n`;
    if (c.aroma) response += `• **Aroma:** ${c.aroma}\n`;
    if (c.rind) response += `• **Rind:** ${c.rind}\n`;

    if (q.includes('pair') || q.includes('wine') || q.includes('food')) {
      response += `\n🍷 **Pairing Suggestions:**\nPairs exquisitely with crusty sourdough, fresh figs or fruit preserves, and a crisp white wine or medium-bodied red that complements its ${c.flavor || 'creamy'} notes.`;
    } else if (q.includes('substitute') || q.includes('sub') || q.includes('alternative')) {
      response += `\n⇌ **Substitutions:**\nLook for other ${c.type || 'similar'} cheeses made with ${c.milk || 'similar'} milk and comparable moisture content (e.g. standard regional artisanal alternatives).`;
    } else if (q.includes('origin') || q.includes('history')) {
      response += `\n📜 **History:**\nHandcrafted with time-honored heritage in ${c.country || 'Europe'}, traditionally aged in natural cellars to preserve its terroir.`;
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
