const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;

let latestData = {
  wave: "--",
  team: [],
  updatedAt: Date.now()
};

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "overlay.html"));
});

app.get("/data", (req, res) => {
  res.json(latestData);
});

app.post("/update", (req, res) => {
  latestData = {
    ...req.body,
    updatedAt: Date.now()
  };

  console.log("Updated PokéRogue overlay data:", latestData);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`PokéRogue overlay running at http://localhost:${PORT}`);
});