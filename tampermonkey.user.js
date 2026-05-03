// ==UserScript==
// @name         PokéRogue Full Overlay Exporter
// @namespace    local.pokerogue.overlay
// @version      6.0
// @match        https://pokerogue.net/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const URL = "http://localhost:3000/update";

  function getName(x) {
    if (!x) return "";
    if (typeof x === "string") return x;
    return x.name || x.label || x.type || x.id || String(x);
  }

  function normalizeMove(m) {
    if (!m) return null;

    if (typeof m === "string") {
      return { name: m, type: "" };
    }

    return {
      name: m.name || m.move || m.id || "Unknown Move",
      type: getName(m.type || m.moveType || m.elementType)
    };
  }

  function normalizePokemon(p, index) {
    return {
      name: p.name || `Pokemon ${index + 1}`,
      form: p.form || "",
      level: p.level ?? "--",

      hp: p.currentHP ?? p.hp ?? "--",
      maxHp: p.maxHP ?? p.maxHp ?? "--",

      status: p.status || "",
      types: Array.isArray(p.types) ? p.types.map(getName) : [],

      teraType: p.teraType || "",
      isTerastallized: !!p.isTerastallized,

      ability: getName(p.ability),
      passive: getName(p.passive),
      nature: getName(p.nature),

      moves: Array.isArray(p.moves)
        ? p.moves.map(normalizeMove).filter(Boolean)
        : Array.isArray(p.moveset)
          ? p.moveset.map(normalizeMove).filter(Boolean)
          : [],

      items: Array.isArray(p.items)
        ? p.items.map(getName)
        : Array.isArray(p.heldItems)
          ? p.heldItems.map(getName)
          : p.heldItem
            ? [getName(p.heldItem)]
            : [],

      stats: p.stats || {
        hp: p.maxHP ?? "",
        atk: p.atk ?? p.attack ?? "",
        def: p.def ?? p.defense ?? "",
        spa: p.spatk ?? p.spAtk ?? p.specialAttack ?? "",
        spd: p.spdef ?? p.spDef ?? p.specialDefense ?? "",
        spe: p.speed ?? p.spe ?? ""
      },

      // Game-provided sprite/image fields first
      sprite:
        p.sprite ||
        p.icon ||
        p.image ||
        p.spriteKey ||
        p.speciesSprite ||
        "",

      fusion:
        p.fusion ||
        p.fusionSpecies ||
        p.fusionName ||
        ""
    };
  }

  async function updateOverlay() {
    const info = window.gameInfo;
    if (!info || !Array.isArray(info.party)) return;

    const data = {
      wave: info.wave ?? "--",
      biome: info.biome ?? "",
      gameMode: info.gameMode ?? "",
      team: info.party.map(normalizePokemon)
    };

    await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    console.log("FULL TEAM SENT:", data);
  }

  setInterval(updateOverlay, 1000);
  updateOverlay();
})();