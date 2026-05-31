const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const https   = require("https");
const sharp   = require("sharp");

const app  = express();
const PORT = 3000;

// ── Pokédex name → ID map ─────────────────────────────────────────────────────
const POKEDEX = JSON.parse(fs.readFileSync(path.join(__dirname, "pokedex-ids.json")));

function toApiName(gameName, form) {
  const base = String(gameName).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!form) return base;
  const f = String(form).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const withForm = base + "-" + f;
  if (POKEDEX[withForm] !== undefined) return withForm;
  return base;
}

function getSpriteKey(gameName, form) {
  const apiName = toApiName(gameName, form);
  const id = POKEDEX[apiName];
  if (!id) return null;
  const f = (form || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (f && apiName.endsWith("-" + f)) {
    const baseApiName = apiName.slice(0, -(f.length + 1));
    const speciesId = POKEDEX[baseApiName] || id;
    return speciesId + "-" + f;
  }
  if (f) return id + "-" + f;
  return String(id);
}

// ── Sprite extraction from TexturePacker/Aseprite atlas ───────────────────────
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode }));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

function parseAtlas(json) {
  // TexturePacker format: { textures: [{ frames, scale, size }] }
  if (json.textures) {
    const tex = json.textures[0];
    return { frames: tex.frames, scale: Number(tex.scale) || 1 };
  }
  // Aseprite format: { frames: [...], meta: { size, scale } }
  return { frames: json.frames, scale: 1 };
}

async function extractFirstFrame(spriteKey, shiny) {
  const base = "https://pokerogue.net/images/pokemon";
  const dir  = shiny ? "/shiny/" : "/";
  const pngUrl  = `${base}${dir}${spriteKey}.png`;
  const jsonUrl = `${base}${dir}${spriteKey}.json`;

  const [pngBuf, jsonBuf] = await Promise.all([
    fetchBuffer(pngUrl),
    fetchBuffer(jsonUrl),
  ]);

  const { frames, scale } = parseAtlas(JSON.parse(jsonBuf.toString()));
  const f   = frames[0];
  const src = f.sourceSize;
  const sso = f.spriteSourceSize;
  const fr  = f.frame;

  // Crop the raw frame out of the packed sheet
  const cropped = await sharp(pngBuf)
    .extract({ left: fr.x, top: fr.y, width: fr.w, height: fr.h })
    .toBuffer();

  // Compute output canvas and placement
  const canvasW = Math.round(src.w * scale);
  const canvasH = Math.round(src.h * scale);
  const offX    = Math.round(sso.x * scale);
  const offY    = Math.round(sso.y * scale);

  // Guard: if frame exceeds canvas, expand canvas rather than error
  const finalW  = Math.max(canvasW, offX + fr.w);
  const finalH  = Math.max(canvasH, offY + fr.h);

  return sharp({
    create: { width: finalW, height: finalH, channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
  .composite([{ input: cropped, left: offX, top: offY }])
  .png()
  .toBuffer();
}

// Simple in-memory cache: spriteKey+shiny → { buf, ts }
const spriteCache = new Map();
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

async function getCachedSprite(spriteKey, shiny) {
  const cacheKey = `${spriteKey}|${shiny}`;
  const cached   = spriteCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.buf;
  const buf = await extractFirstFrame(spriteKey, shiny);
  spriteCache.set(cacheKey, { buf, ts: Date.now() });
  return buf;
}

// ── Game state ────────────────────────────────────────────────────────────────
let latestData = {
  wave: "--", biome: "", gameMode: "", playTime: 0, money: 0,
  team: [], updatedAt: Date.now()
};

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

// ── Pages ─────────────────────────────────────────────────────────────────────
app.get("/",      (req, res) => res.sendFile(path.join(__dirname, "setup.html")));
app.get("/full",  (req, res) => res.sendFile(path.join(__dirname, "overlay.html")));
app.get("/wave",  (req, res) => res.sendFile(path.join(__dirname, "wave.html")));
app.get("/party", (req, res) => res.sendFile(path.join(__dirname, "party.html")));
app.get("/stats", (req, res) => res.sendFile(path.join(__dirname, "stats.html")));

// ── Sprite endpoint ───────────────────────────────────────────────────────────
// GET /sprite?slot=0
// Looks up party slot, resolves name+form → spriteKey, auto-detects shiny,
// extracts first frame from the TexturePacker/Aseprite atlas, returns PNG.
app.get("/sprite", async (req, res) => {
  const slot = parseInt(req.query.slot);
  if (isNaN(slot) || slot < 0 || slot > 5)
    return res.status(400).json({ error: "slot must be 0–5" });

  const pokemon = latestData.team[slot];
  if (!pokemon)
    return res.status(404).json({ error: `No pokemon in slot ${slot}` });

  const spriteKey = getSpriteKey(pokemon.name, pokemon.form);
  if (!spriteKey)
    return res.status(404).json({ error: `Could not resolve sprite for "${pokemon.name}"` });

  const shiny = !!pokemon.shiny;

  try {
    const buf = await getCachedSprite(spriteKey, shiny);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-cache");
    res.send(buf);
    console.log(`/sprite slot=${slot} → ${pokemon.name}${pokemon.form ? "-"+pokemon.form : ""} (shiny:${shiny}) [${buf.length}b]`);
  } catch (err) {
    const status = err.status === 404 ? 404 : 502;
    console.error(`/sprite error for ${spriteKey}:`, err.message);
    res.status(status).json({ error: err.message });
  }
});

// ── Data API ──────────────────────────────────────────────────────────────────
app.get("/data", (req, res) => res.json(latestData));

app.post("/update", (req, res) => {
  latestData = { ...req.body, updatedAt: Date.now() };
  console.log(`[Wave ${latestData.wave}] ${latestData.biome} | Team: ${(latestData.team||[]).map(p=>p.name).join(", ")}`);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`PokéRogue overlay running at http://localhost:${PORT}`);
  console.log(`  Setup guide:   http://localhost:${PORT}/`);
  console.log(`  Main overlay:  http://localhost:${PORT}/full`);
  console.log(`  Wave display:  http://localhost:${PORT}/wave`);
  console.log(`  Party strip:   http://localhost:${PORT}/party`);
  console.log(`  Run stats:     http://localhost:${PORT}/stats`);
  console.log(`  Sprite proxy:  http://localhost:${PORT}/sprite?slot=0`);
});
