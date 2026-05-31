const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;

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

// Original overlay
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "overlay.html"));
});

// New dedicated browser source pages
app.get("/wave", (req, res) => {
  res.sendFile(path.join(__dirname, "wave.html"));
});

app.get("/party", (req, res) => {
  res.sendFile(path.join(__dirname, "party.html"));
});

app.get("/stats", (req, res) => {
  res.sendFile(path.join(__dirname, "stats.html"));
});

// Data endpoint (unchanged — all pages use this)
app.get("/data", (req, res) => {
  res.json(latestData);
});

// Update endpoint (unchanged)
app.post("/update", (req, res) => {
  latestData = {
    ...req.body,
    updatedAt: Date.now()
  };
  console.log(`[Wave ${latestData.wave}] ${latestData.biome} | Team: ${(latestData.team||[]).map(p=>p.name).join(', ')}`);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`PokéRogue overlay running at http://localhost:${PORT}`);
  console.log(`  Main overlay:  http://localhost:${PORT}/`);
  console.log(`  Wave display:  http://localhost:${PORT}/wave`);
  console.log(`  Party strip:   http://localhost:${PORT}/party`);
  console.log(`  Run stats:     http://localhost:${PORT}/stats`);
});
