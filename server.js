const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// ── Name → Dex ID map (from PokeAPI) ─────────────────────────────────────────
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
    // Form was baked into PokeAPI name (e.g. poltchageist-counterfeit)
    // Sprite path needs species base ID + form suffix
    const baseApiName = apiName.slice(0, -(f.length + 1));
    const speciesId = POKEDEX[baseApiName] || id;
    return speciesId + "-" + f;
  }
  if (f) {
    return id + "-" + f;
  }
  return String(id);
}

function getPokerogueSpriteUrl(spriteKey, shiny) {
  const base = "https://pokerogue.net/images/pokemon";
  if (shiny) return `${base}/shiny/${spriteKey}.png`;
  return `${base}/${spriteKey}.png`;
}

// ── Game state ────────────────────────────────────────────────────────────────
let latestData = {
  wave: "--",
  biome: "",
  gameMode: "",
  playTime: 0,
  money: 0,
  team: [],
  updatedAt: Date.now()
};

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

// ── Pages ─────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "overlay.html")));
app.get("/wave",  (req, res) => res.sendFile(path.join(__dirname, "wave.html")));
app.get("/party", (req, res) => res.sendFile(path.join(__dirname, "party.html")));
app.get("/stats", (req, res) => res.sendFile(path.join(__dirname, "stats.html")));

// ── Sprite proxy ──────────────────────────────────────────────────────────────
// GET /sprite?slot=0   (auto-detects shiny from team data)
// GET /sprite?slot=0&back=true  (optional: back sprite)
app.get("/sprite", (req, res) => {
  const slot = parseInt(req.query.slot);

  if (isNaN(slot) || slot < 0 || slot > 5) {
    return res.status(400).json({ error: "slot must be 0–5" });
  }

  const pokemon = latestData.team[slot];
  if (!pokemon) {
    return res.status(404).json({ error: `No pokemon in slot ${slot}` });
  }

  const spriteKey = getSpriteKey(pokemon.name, pokemon.form);
  if (!spriteKey) {
    return res.status(404).json({ error: `Could not resolve sprite for ${pokemon.name}` });
  }

  const shiny = !!pokemon.shiny;
  const spriteUrl = getPokerogueSpriteUrl(spriteKey, shiny);

  console.log(`/sprite?slot=${slot} → ${pokemon.name}${pokemon.form ? '-'+pokemon.form : ''} (shiny:${shiny}) → ${spriteUrl}`);
  res.redirect(302, spriteUrl);
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
  console.log(`  Main overlay:  http://localhost:${PORT}/`);
  console.log(`  Wave display:  http://localhost:${PORT}/wave`);
  console.log(`  Party strip:   http://localhost:${PORT}/party`);
  console.log(`  Run stats:     http://localhost:${PORT}/stats`);
  console.log(`  Sprite proxy:  http://localhost:${PORT}/sprite?slot=0`);
});
