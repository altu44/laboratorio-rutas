/*
 * grid.js — Modelo del tablero 20 x 20.
 *
 * Cada celda tiene UN único tipo, por lo que es imposible que una casilla sea
 * muro y meta a la vez (estado incoherente). Tipos posibles:
 *   - empty  : baldosa normal (coste de entrada 1)
 *   - wall   : obstáculo (no se puede entrar)
 *   - weight : baldosa ponderada (coste de entrada = weight)
 *   - start  : inicio (solo puede haber uno)
 *   - goal   : meta (puede haber varias; cada una tiene una penalización >= 0)
 *
 * No depende del DOM: lo usan tanto la interfaz (app.js) como las pruebas.
 */
(function (Lab) {
  "use strict";

  const SIZE = 20;
  const MIN_WEIGHT = 2;
  const MAX_WEIGHT = 99;
  const MAX_PENALTY = 999;

  const TYPE = Object.freeze({
    EMPTY: "empty",
    WALL: "wall",
    WEIGHT: "weight",
    START: "start",
    GOAL: "goal",
  });

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  /** Generador pseudoaleatorio con semilla (mulberry32) para mapas reproducibles. */
  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Grid {
    constructor(size = SIZE) {
      this.size = size;
      this.cells = [];
      for (let i = 0; i < size * size; i++) this.cells.push(Grid.emptyCell());
      this.start = null; // índice de la celda de inicio o null
    }

    static emptyCell() {
      return { type: TYPE.EMPTY, weight: 1, penalty: 0 };
    }

    /* ---------- utilidades de coordenadas ---------- */
    index(row, col) {
      return row * this.size + col;
    }
    rowOf(idx) {
      return Math.floor(idx / this.size);
    }
    colOf(idx) {
      return idx % this.size;
    }
    inBounds(row, col) {
      return row >= 0 && row < this.size && col >= 0 && col < this.size;
    }
    cellAt(row, col) {
      return this.cells[this.index(row, col)];
    }

    /* ---------- consultas ---------- */
    isSpecial(idx) {
      const t = this.cells[idx].type;
      return t === TYPE.START || t === TYPE.GOAL;
    }
    isPassable(idx) {
      return this.cells[idx].type !== TYPE.WALL;
    }
    /** Coste de ENTRAR en una celda: 1 normal, su valor si es ponderada. */
    enterCost(idx) {
      const c = this.cells[idx];
      return c.type === TYPE.WEIGHT ? c.weight : 1;
    }
    /** Lista de metas ordenada por índice (orden determinista). */
    goals() {
      const list = [];
      this.cells.forEach((c, idx) => {
        if (c.type === TYPE.GOAL) list.push({ idx, row: this.rowOf(idx), col: this.colOf(idx), penalty: c.penalty });
      });
      return list;
    }
    /** Errores que impiden ejecutar una búsqueda. */
    validate() {
      const errors = [];
      if (this.start === null) errors.push("Falta el inicio: coloca una celda de inicio (S).");
      if (this.goals().length === 0) errors.push("Falta la meta: añade al menos una meta (M).");
      return errors;
    }

    /* ---------- edición (todas devuelven true si cambian algo) ---------- */
    setWall(row, col) {
      const idx = this.index(row, col);
      if (this.isSpecial(idx) || this.cells[idx].type === TYPE.WALL) return false;
      this.cells[idx] = { type: TYPE.WALL, weight: 1, penalty: 0 };
      return true;
    }

    setWeight(row, col, weight) {
      const idx = this.index(row, col);
      if (this.isSpecial(idx)) return false;
      const w = clampInt(weight, MIN_WEIGHT, MAX_WEIGHT, MIN_WEIGHT);
      const c = this.cells[idx];
      if (c.type === TYPE.WEIGHT && c.weight === w) return false;
      this.cells[idx] = { type: TYPE.WEIGHT, weight: w, penalty: 0 };
      return true;
    }

    erase(row, col) {
      const idx = this.index(row, col);
      if (this.cells[idx].type === TYPE.EMPTY) return false;
      if (idx === this.start) this.start = null;
      this.cells[idx] = Grid.emptyCell();
      return true;
    }

    /** Coloca (o mueve) el inicio. No se permite sobre una meta. */
    setStart(row, col) {
      const idx = this.index(row, col);
      if (this.cells[idx].type === TYPE.GOAL) return false;
      if (idx === this.start) return false;
      if (this.start !== null) this.cells[this.start] = Grid.emptyCell();
      this.cells[idx] = { type: TYPE.START, weight: 1, penalty: 0 };
      this.start = idx;
      return true;
    }

    /** Añade una meta (o actualiza su penalización). No se permite sobre el inicio. */
    setGoal(row, col, penalty = 0) {
      const idx = this.index(row, col);
      if (idx === this.start) return false;
      const p = clampInt(penalty, 0, MAX_PENALTY, 0); // penalización NO negativa
      const c = this.cells[idx];
      if (c.type === TYPE.GOAL && c.penalty === p) return false;
      this.cells[idx] = { type: TYPE.GOAL, weight: 1, penalty: p };
      return true;
    }

    /** Mueve el inicio o una meta a otra celda que no sea especial. */
    moveSpecial(fromIdx, toRow, toCol) {
      const toIdx = this.index(toRow, toCol);
      if (fromIdx === toIdx || !this.isSpecial(fromIdx) || this.isSpecial(toIdx)) return false;
      const moving = this.cells[fromIdx];
      this.cells[toIdx] = { ...moving };
      this.cells[fromIdx] = Grid.emptyCell();
      if (fromIdx === this.start) this.start = toIdx;
      return true;
    }

    clearAll() {
      for (let i = 0; i < this.cells.length; i++) this.cells[i] = Grid.emptyCell();
      this.start = null;
    }

    clone() {
      const g = new Grid(this.size);
      g.cells = this.cells.map((c) => ({ ...c }));
      g.start = this.start;
      return g;
    }

    /* ---------- carga de mapas ---------- */
    /**
     * Crea un tablero a partir de texto:
     *   '.' vacío   '#' o 'x' muro   'S' inicio   '2'..'9' peso
     *   letras de meta (G, H, I, J, K) con su penalización en `penalties`.
     */
    static fromAscii(lines, penalties = {}) {
      const g = new Grid(lines.length);
      lines.forEach((line, row) => {
        if (line.length !== g.size) throw new Error(`Fila ${row} con longitud ${line.length}, se esperaba ${g.size}`);
        [...line].forEach((ch, col) => {
          if (ch === "#" || ch === "x" || ch === "X") g.setWall(row, col);
          else if (ch === "S") g.setStart(row, col);
          else if (/[2-9]/.test(ch)) g.setWeight(row, col, Number(ch));
          else if ("GHIJK".includes(ch)) g.setGoal(row, col, penalties[ch] || 0);
        });
      });
      return g;
    }

    toAscii() {
      const letters = "GHIJK";
      let goalN = 0;
      const penalties = {};
      const lines = [];
      for (let r = 0; r < this.size; r++) {
        let line = "";
        for (let c = 0; c < this.size; c++) {
          const cell = this.cellAt(r, c);
          if (cell.type === TYPE.WALL) line += "#";
          else if (cell.type === TYPE.START) line += "S";
          else if (cell.type === TYPE.WEIGHT) line += cell.weight <= 9 ? String(cell.weight) : "9";
          else if (cell.type === TYPE.GOAL) {
            const l = letters[Math.min(goalN++, letters.length - 1)];
            penalties[l] = cell.penalty;
            line += l;
          } else line += ".";
        }
        lines.push(line);
      }
      return { lines, penalties };
    }

    /**
     * Mapa aleatorio reproducible: misma semilla => mismo mapa.
     * opts: { goals, wallDensity, weightDensity, maxWeight, maxPenalty }
     */
    static random(seed, opts = {}) {
      const rnd = seededRandom(seed);
      const size = opts.size || SIZE;
      const g = new Grid(size);
      const wallDensity = opts.wallDensity ?? 0.22;
      const weightDensity = opts.weightDensity ?? 0.12;
      const maxWeight = clampInt(opts.maxWeight ?? 9, MIN_WEIGHT, MAX_WEIGHT, 9);
      const maxPenalty = clampInt(opts.maxPenalty ?? 10, 0, MAX_PENALTY, 10);
      const goals = clampInt(opts.goals ?? 1, 1, 10, 1);
      const pick = () => Math.floor(rnd() * size * size);

      for (let idx = 0; idx < size * size; idx++) {
        const r = rnd();
        const row = Math.floor(idx / size);
        const col = idx % size;
        if (r < wallDensity) g.setWall(row, col);
        else if (r < wallDensity + weightDensity) g.setWeight(row, col, MIN_WEIGHT + Math.floor(rnd() * (maxWeight - MIN_WEIGHT + 1)));
      }
      const s = pick();
      g.erase(g.rowOf(s), g.colOf(s));
      g.setStart(g.rowOf(s), g.colOf(s));
      let placed = 0;
      let tries = 0;
      while (placed < goals && tries++ < 1000) {
        const idx = pick();
        if (g.isSpecial(idx)) continue;
        g.erase(g.rowOf(idx), g.colOf(idx));
        g.setGoal(g.rowOf(idx), g.colOf(idx), Math.floor(rnd() * (maxPenalty + 1)));
        placed++;
      }
      return g;
    }
  }

  Lab.SIZE = SIZE;
  Lab.TYPE = TYPE;
  Lab.MIN_WEIGHT = MIN_WEIGHT;
  Lab.MAX_WEIGHT = MAX_WEIGHT;
  Lab.MAX_PENALTY = MAX_PENALTY;
  Lab.Grid = Grid;
  Lab.seededRandom = seededRandom;
  Lab.clampInt = clampInt;
})((globalThis.Lab = globalThis.Lab || {}));
