/*
 * app.js — Interfaz del laboratorio (DOM, edición, animación y comparativa).
 *
 * Toda la lógica de búsqueda vive en algorithms.js; aquí solo se pinta el
 * tablero, se gestionan los eventos y se animan las trazas.
 */
(function () {
  "use strict";

  const { Grid, TYPE, search, SCENARIOS, loadScenario, ALGORITHMS, ALGORITHM_INFO, clampInt } = Lab;
  const $ = (id) => document.getElementById(id);

  const ui = {
    grid: $("grid"),
    routes: $("routes"),
    algorithm: $("algorithm"),
    speed: $("speed"),
    speedLabel: $("speedLabel"),
    showExploration: $("showExploration"),
    btnEjecutar: $("btnEjecutar"),
    btnComparar: $("btnComparar"),
    btnPausar: $("btnPausar"),
    btnAleatorio: $("btnAleatorio"),
    btnMapaAleatorio: $("btnMapaAleatorio"),
    btnLimpiar: $("btnLimpiar"),
    btnAlternar: $("btnAlternar"),
    btnSuperponer: $("btnSuperponer"),
    routeSelect: $("routeSelect"),
    tileWeight: $("tileWeight"),
    goalPenalty: $("goalPenalty"),
    randomGoals: $("randomGoals"),
    toolHint: $("toolHint"),
    scenarios: $("scenarios"),
    statusCard: $("statusCard"),
    statusTitle: $("statusTitle"),
    statusText: $("statusText"),
    mExplored: $("mExplored"),
    mSteps: $("mSteps"),
    mPathCost: $("mPathCost"),
    mPenalty: $("mPenalty"),
    mTotal: $("mTotal"),
    mCalc: $("mCalc"),
    explain: $("explain"),
    compareBody: $("compareBody"),
    compareTable: document.querySelector(".compare-table"),
    conclusions: $("conclusions"),
  };

  const SPEEDS = [
    { label: "Muy lenta", delay: 160, batch: 1 },
    { label: "Lenta", delay: 70, batch: 1 },
    { label: "Media", delay: 25, batch: 1 },
    { label: "Rápida", delay: 10, batch: 3 },
    { label: "Muy rápida", delay: 0, batch: 12 },
  ];
  const TOOL_NAMES = { wall: "obstáculo", erase: "borrar", start: "inicio", goal: "meta", weight: "peso" };
  const COLORS = { bfs: "var(--a-bfs)", dfs: "var(--a-dfs)", ucs: "var(--a-ucs)", astar: "var(--a-astar)" };
  const OFFSETS = { bfs: -0.2, dfs: -0.07, ucs: 0.07, astar: 0.2 }; // separación al superponer

  const state = {
    grid: new Grid(),
    scenarioId: null,
    tool: "wall",
    cursor: 0,
    pointer: null, // { mode: 'paint' | 'move', from, moved }
    single: null, // último resultado de "Ejecutar"
    compare: null, // resultados de "Comparar todos"
    compareStale: false,
    view: { mode: "none", alg: "bfs" }, // none | single | compare | overlay
    anim: null, // { result, i, timer, paused }
    vis: { explored: new Set(), frontier: new Set(), path: new Set(), current: -1, chosenGoal: -1 },
  };

  const cellEls = [];

  /* ================================================================ render */
  function buildBoard() {
    const n = state.grid.size;
    ui.grid.innerHTML = "";
    for (let idx = 0; idx < n * n; idx++) {
      const d = document.createElement("div");
      d.className = "cell";
      d.dataset.idx = idx;
      d.setAttribute("role", "gridcell");
      ui.grid.appendChild(d);
      cellEls.push(d);
    }
  }

  function cellLabel(idx) {
    const c = state.grid.cells[idx];
    const pos = `fila ${state.grid.rowOf(idx)}, columna ${state.grid.colOf(idx)}`;
    const names = { empty: "vacía", wall: "obstáculo", weight: `peso ${c.weight}`, start: "inicio", goal: `meta, coste ${c.penalty}` };
    return `${pos}: ${names[c.type]}`;
  }

  function renderCell(idx) {
    const c = state.grid.cells[idx];
    const el = cellEls[idx];
    const v = state.vis;
    let cls = "cell " + c.type;
    if (c.type !== TYPE.START && c.type !== TYPE.GOAL && c.type !== TYPE.WALL) {
      if (v.path.has(idx)) cls += " path";
      else if (v.explored.has(idx)) cls += " explored";
      else if (v.frontier.has(idx)) cls += " frontier";
    }
    if (idx === v.current) cls += " current";
    if (idx === v.chosenGoal) cls += " chosen";
    if (idx === state.cursor) cls += " cursor";
    el.className = cls;

    let text = "";
    if (c.type === TYPE.START) text = "S";
    else if (c.type === TYPE.WEIGHT) text = String(c.weight);
    else if (c.type === TYPE.GOAL) text = c.penalty > 0 ? `M<small>+${c.penalty}</small>` : "M";
    if (el.dataset.text !== text) {
      el.innerHTML = text;
      el.dataset.text = text;
    }
    el.setAttribute("aria-label", cellLabel(idx));
  }

  function renderBoard() {
    for (let i = 0; i < cellEls.length; i++) renderCell(i);
    ui.grid.setAttribute("aria-activedescendant", "");
  }

  function clearVis() {
    state.vis = { explored: new Set(), frontier: new Set(), path: new Set(), current: -1, chosenGoal: -1 };
    ui.routes.innerHTML = "";
  }

  function polyline(result, alg, offset) {
    if (!result || !result.found) return "";
    const g = state.grid;
    const pts = result.path.map((i) => `${(g.colOf(i) + 0.5 + offset).toFixed(3)},${(g.rowOf(i) + 0.5 + offset).toFixed(3)}`).join(" ");
    const last = result.path[result.path.length - 1];
    return (
      `<polyline points="${pts}" style="stroke:${COLORS[alg]}"></polyline>` +
      `<circle cx="${g.colOf(last) + 0.5 + offset}" cy="${g.rowOf(last) + 0.5 + offset}" r=".16" style="fill:${COLORS[alg]}"></circle>`
    );
  }

  function drawRoutes(list) {
    ui.routes.innerHTML = list.map(([alg, r, off]) => polyline(r, alg, off)).join("");
  }

  /* ============================================================== estado */
  function setStatus(kind, title, text = "") {
    ui.statusCard.dataset.kind = kind;
    ui.statusTitle.textContent = title;
    ui.statusText.textContent = text;
  }

  function setMetrics(r, liveExplored) {
    const dash = "—";
    if (!r) {
      ui.mExplored.textContent = liveExplored ?? dash;
      ui.mSteps.textContent = ui.mPathCost.textContent = ui.mPenalty.textContent = ui.mTotal.textContent = dash;
      ui.mCalc.textContent = "ruta + penalización de la meta";
      return;
    }
    ui.mExplored.textContent = liveExplored ?? r.explored;
    if (liveExplored !== undefined) {
      ui.mSteps.textContent = ui.mPathCost.textContent = ui.mPenalty.textContent = ui.mTotal.textContent = "…";
      ui.mCalc.textContent = `${ALGORITHM_INFO[r.algorithm].short} explorando…`;
      return;
    }
    if (r.found) {
      ui.mSteps.textContent = r.steps;
      ui.mPathCost.textContent = r.pathCost;
      ui.mPenalty.textContent = r.penalty;
      ui.mTotal.textContent = r.totalCost;
      ui.mCalc.textContent = `${ALGORITHM_INFO[r.algorithm].short}: ${r.pathCost} (ruta) + ${r.penalty} (meta) = ${r.totalCost}`;
    } else {
      ui.mSteps.textContent = ui.mPathCost.textContent = ui.mPenalty.textContent = dash;
      ui.mTotal.textContent = "∞";
      ui.mCalc.textContent = r.error ? "no se ha ejecutado" : `${ALGORITHM_INFO[r.algorithm].short}: no existe ruta`;
    }
  }

  function renderExplain() {
    const info = ALGORITHM_INFO[ui.algorithm.value];
    ui.explain.dataset.alg = ui.algorithm.value;
    ui.explain.innerHTML = `
      <h3>Algoritmo elegido</h3>
      <h4>${info.name}</h4>
      <p>${info.text}</p>
      <dl>
        <dt>Estructura</dt><dd>${info.structure}</dd>
        <dt>Criterio</dt><dd>${info.criterion}</dd>
        <dt>Garantiza</dt><dd>${info.guarantee}</dd>
      </dl>`;
  }

  function renderToolHint() {
    const extra = {
      wall: "Haz clic o arrastra para pintar.",
      erase: "Haz clic o arrastra para borrar.",
      start: "Haz clic para colocar/mover el inicio.",
      goal: "Haz clic para añadir una meta con el coste indicado.",
      weight: `Haz clic o arrastra para pintar baldosas de peso ${readWeight()}.`,
    }[state.tool];
    ui.toolHint.textContent = `Herramienta activa: ${TOOL_NAMES[state.tool]}. ${extra} Con teclado, usa flechas y Enter.`;
    document.querySelectorAll(".tool").forEach((b) => {
      const on = b.dataset.tool === state.tool;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on);
    });
  }

  function renderScenarioButtons() {
    ui.scenarios.innerHTML = SCENARIOS.map(
      (s) => `<button type="button" class="scenario" data-scenario="${s.id}" title="${s.tests}">
        <strong><span class="num">${s.id}</span>${s.title}</strong><small>${s.subtitle}</small></button>`
    ).join("");
    ui.scenarios.querySelectorAll(".scenario").forEach((b) => b.addEventListener("click", () => loadScenarioUI(Number(b.dataset.scenario))));
  }

  function markScenario() {
    ui.scenarios.querySelectorAll(".scenario").forEach((b) => b.classList.toggle("active", Number(b.dataset.scenario) === state.scenarioId));
  }

  /* ========================================================= comparativa */
  function renderCompare() {
    const res = state.compare;
    ui.compareTable.classList.toggle("stale", state.compareStale);
    if (!res) {
      ui.compareBody.innerHTML = `<tr class="empty"><td colspan="6">Pulsa «Comparar todos» para ejecutar los cuatro algoritmos sobre el mismo mapa.</td></tr>`;
      ui.conclusions.innerHTML = "";
      return;
    }
    const found = ALGORITHMS.filter((a) => res[a].found);
    const min = (key) => Math.min(...found.map((a) => res[a][key]));
    const bestSteps = min("steps");
    const bestCost = min("totalCost");
    const bestExpl = Math.min(...ALGORITHMS.map((a) => res[a].explored));
    const selected = state.view.mode === "compare" ? state.view.alg : null;

    ui.compareBody.innerHTML = ALGORITHMS.map((a) => {
      const r = res[a];
      const info = ALGORITHM_INFO[a];
      const best = (ok) => (ok ? " best" : "");
      if (r.error) {
        return `<tr data-alg="${a}"><td><span class="alg-name"><i class="line l-${a}"></i>${info.short}</span></td><td colspan="5">${r.error}</td></tr>`;
      }
      return `<tr data-alg="${a}" class="${selected === a ? "selected" : ""}">
        <td><span class="alg-name"><i class="line l-${a}"></i>${info.short}</span></td>
        <td>${r.found ? `(${r.goal.row}, ${r.goal.col})${r.penalty ? ` +${r.penalty}` : ""}` : "sin ruta"}</td>
        <td class="num${best(found.length && r.explored === bestExpl)}">${r.explored}</td>
        <td class="num${best(r.found && r.steps === bestSteps)}">${r.found ? r.steps : "—"}</td>
        <td class="num${best(r.found && r.totalCost === bestCost)}">${r.found ? r.totalCost : "∞"}</td>
        <td>${r.found ? `${r.pathCost} (ruta) + ${r.penalty} (meta) = ${r.totalCost}` : "no existe ruta"}</td>
      </tr>`;
    }).join("");
    ui.compareBody.querySelectorAll("tr[data-alg]").forEach((tr) => tr.addEventListener("click", () => showCompareRoute(tr.dataset.alg)));
    ui.conclusions.innerHTML = conclusions(res);
  }

  function conclusions(res) {
    const S = (a) => ALGORITHM_INFO[a].short;
    const stale = state.compareStale ? `<p class="stale-note">⚠ El mapa ha cambiado desde esta comparación: pulsa «Comparar todos» para actualizarla.</p>` : "";
    if (ALGORITHMS.some((a) => res[a].error)) return stale + `<p>No se puede comparar: ${res.bfs.error}</p>`;
    const found = ALGORITHMS.filter((a) => res[a].found);
    if (!found.length) {
      return stale + `<p><b>Conclusión:</b> ninguna meta es alcanzable. Los cuatro algoritmos terminan tras explorar toda la zona accesible (${ALGORITHMS.map((a) => `${S(a)} ${res[a].explored}`).join(", ")}) e informan de que no existe ruta.</p>`;
    }
    const list = [];
    const minSteps = Math.min(...found.map((a) => res[a].steps));
    const minCost = Math.min(...found.map((a) => res[a].totalCost));
    const byCost = found.filter((a) => res[a].totalCost === minCost).map(S);
    list.push(`<b>Menos pasos:</b> ${found.filter((a) => res[a].steps === minSteps).map(S).join(", ")} (${minSteps} pasos).`);
    list.push(`<b>Menor coste total:</b> ${byCost.join(", ")} (${minCost}).`);
    const u = res.ucs;
    const s = res.astar;
    const ok = u.totalCost === s.totalCost;
    list.push(`<b>UCS y A* ${ok ? "coinciden" : "NO coinciden"} en coste óptimo</b> ${ok ? "✔" : "✘"} (${u.totalCost} = ${s.totalCost}). A* exploró ${s.explored} celdas frente a ${u.explored} de UCS${u.explored ? ` (${Math.round((100 * (u.explored - s.explored)) / u.explored)} % menos)` : ""}.`);
    const b = res.bfs;
    if (b.found && b.totalCost > minCost) {
      const why = b.goal.idx !== u.goal.idx
        ? `BFS elige la meta (${b.goal.row}, ${b.goal.col}) por ser la más cercana en pasos, pero su coste total es ${b.pathCost} + ${b.penalty} = ${b.totalCost}; UCS/A* eligen (${u.goal.row}, ${u.goal.col}) con ${u.pathCost} + ${u.penalty} = ${u.totalCost}.`
        : `BFS ignora los pesos: toma ${b.steps} pasos con coste ${b.totalCost}, mientras UCS/A* dan ${u.steps} pasos pero coste ${u.totalCost}.`;
      list.push(why);
    }
    const d = res.dfs;
    if (d.found && (d.steps > minSteps || d.totalCost > minCost)) {
      list.push(`DFS devuelve una ruta de ${d.steps} pasos y coste ${d.totalCost}: encuentra solución, pero no garantiza la más corta ni la más barata.`);
    }
    return stale + `<p><b>Conclusión automática:</b></p><ul>${list.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  }

  function showCompareRoute(alg) {
    if (!state.compare || state.compareStale) return;
    stopAnimation();
    const r = state.compare[alg];
    state.view = { mode: "compare", alg };
    ui.routeSelect.value = alg;
    clearVis();
    r.trace.forEach((st) => state.vis.explored.add(st.cell));
    r.path.forEach((i) => state.vis.path.add(i));
    if (r.found) state.vis.chosenGoal = r.goal.idx;
    drawRoutes([[alg, r, 0]]);
    renderBoard();
    setMetrics(r);
    renderCompare();
    toggleActive(ui.btnAlternar);
    setStatus(r.found ? "ok" : "fail", `Mostrando ruta de ${ALGORITHM_INFO[alg].short}`, r.found ? `Meta (${r.goal.row}, ${r.goal.col}) · ${r.steps} pasos · coste total ${r.totalCost} · ${r.explored} exploradas.` : `No existe ruta. Exploró ${r.explored} celdas.`);
  }

  function showOverlay() {
    if (!state.compare || state.compareStale) runCompare({ silent: true });
    if (!state.compare || ALGORITHMS.some((a) => state.compare[a].error)) return;
    stopAnimation();
    state.view = { mode: "overlay", alg: ui.routeSelect.value || "bfs" };
    clearVis();
    const res = state.compare;
    drawRoutes(ALGORITHMS.map((a) => [a, res[a], OFFSETS[a]]));
    renderBoard();
    setMetrics(res[state.view.alg]);
    renderCompare();
    toggleActive(ui.btnSuperponer);
    const found = ALGORITHMS.filter((a) => res[a].found);
    setStatus(found.length ? "ok" : "fail", "Rutas superpuestas", found.length ? "Cada color es la ruta de un algoritmo (BFS azul, DFS morado, UCS naranja, A* verde azulado)." : "Ningún algoritmo encontró ruta.");
  }

  function toggleActive(btn) {
    [ui.btnAlternar, ui.btnSuperponer].forEach((b) => b.classList.toggle("is-active", b === btn));
  }

  /* ============================================================ ejecución */
  function readWeight() {
    return clampInt(ui.tileWeight.value, Lab.MIN_WEIGHT, Lab.MAX_WEIGHT, 5);
  }
  function readPenalty() {
    return clampInt(ui.goalPenalty.value, 0, Lab.MAX_PENALTY, 0);
  }

  function validateOrWarn() {
    const errors = state.grid.validate();
    if (errors.length) {
      setStatus("warn", "No se puede ejecutar", errors.join(" "));
      setMetrics(null);
      return false;
    }
    return true;
  }

  function runSelected(opts = {}) {
    const alg = ui.algorithm.value;
    stopAnimation();
    clearVis();
    toggleActive(null);
    renderBoard();
    if (!validateOrWarn()) return null;
    const r = search.run(alg, state.grid);
    state.single = r;
    state.view = { mode: "single", alg };
    const animate = ui.showExploration.checked && !opts.instant;
    if (animate || opts.until !== undefined) startAnimation(r, opts.until);
    else finishRun(r);
    return r;
  }

  function startAnimation(r, until) {
    state.anim = { result: r, i: 0, timer: null, paused: false };
    ui.btnPausar.disabled = false;
    ui.btnPausar.textContent = "⏸ Pausar";
    setStatus("run", `${ALGORITHM_INFO[r.algorithm].short} explorando…`, "Azul: celdas exploradas · Lila: frontera (pendientes de explorar) · Borde negro: nodo actual.");
    if (until !== undefined) {
      advance(until);
      if (state.anim.i >= r.trace.length) finishRun(r);
      else pause(true);
      return;
    }
    tick();
  }

  function advance(count) {
    const a = state.anim;
    const trace = a.result.trace;
    const v = state.vis;
    for (let k = 0; k < count && a.i < trace.length; k++) {
      const st = trace[a.i++];
      v.frontier.delete(st.cell);
      v.explored.add(st.cell);
      for (const n of st.added) if (!v.explored.has(n)) v.frontier.add(n);
      v.current = st.cell;
    }
    renderBoard();
    setMetrics(a.result, a.i);
  }

  function tick() {
    const a = state.anim;
    if (!a || a.paused) return;
    const sp = SPEEDS[Number(ui.speed.value) - 1];
    advance(sp.batch);
    if (a.i >= a.result.trace.length) finishRun(a.result);
    else a.timer = setTimeout(tick, sp.delay);
  }

  function pause(force) {
    const a = state.anim;
    if (!a) return;
    a.paused = force !== undefined ? force : !a.paused;
    clearTimeout(a.timer);
    ui.btnPausar.textContent = a.paused ? "▶ Reanudar" : "⏸ Pausar";
    if (a.paused) setStatus("warn", "En pausa", `${ALGORITHM_INFO[a.result.algorithm].short} lleva ${a.i} de ${a.result.trace.length} celdas exploradas. Pulsa «Reanudar» para continuar.`);
    else {
      setStatus("run", `${ALGORITHM_INFO[a.result.algorithm].short} explorando…`, "Azul: celdas exploradas · Lila: frontera · Borde negro: nodo actual.");
      tick();
    }
  }

  function stopAnimation() {
    if (state.anim) clearTimeout(state.anim.timer);
    state.anim = null;
    ui.btnPausar.disabled = true;
    ui.btnPausar.textContent = "⏸ Pausar";
  }

  function finishRun(r) {
    stopAnimation();
    const v = state.vis;
    if (ui.showExploration.checked) r.trace.forEach((st) => v.explored.add(st.cell));
    else v.explored.clear();
    v.frontier.clear();
    v.current = -1;
    r.path.forEach((i) => v.path.add(i));
    v.chosenGoal = r.found ? r.goal.idx : -1;
    drawRoutes([[r.algorithm, r, 0]]);
    renderBoard();
    setMetrics(r);
    const S = ALGORITHM_INFO[r.algorithm].short;
    if (r.found) {
      setStatus("ok", `Ruta encontrada con ${S}`, `Meta (${r.goal.row}, ${r.goal.col}) · ${r.steps} pasos · coste ${r.pathCost} + ${r.penalty} = ${r.totalCost} · ${r.explored} celdas exploradas.`);
    } else {
      setStatus("fail", "Sin solución", `${S} ha explorado las ${r.explored} celdas alcanzables y no existe ninguna ruta hasta una meta.`);
      state.grid.goals().forEach((g) => cellEls[g.idx].classList.add("flash"));
    }
  }

  function runCompare(opts = {}) {
    stopAnimation();
    if (!validateOrWarn()) {
      state.compare = null;
      renderCompare();
      return;
    }
    state.compare = search.runAll(state.grid);
    state.compareStale = false;
    if (!opts.silent) {
      showOverlay();
      const found = ALGORITHMS.filter((a) => state.compare[a].found).length;
      setStatus(found ? "ok" : "fail", "Comparación completada", found ? "Los cuatro algoritmos se han ejecutado sobre el mismo mapa. Usa «Alternar rutas» o haz clic en una fila para ver la exploración de cada uno." : "Ninguno de los cuatro algoritmos encuentra ruta: no existe solución.");
    }
    renderCompare();
  }

  /* ============================================================== edición */
  /** Se llama tras cualquier cambio del tablero: invalida resultados anteriores. */
  function boardChanged(message) {
    const hadResults = state.single || (state.compare && !state.compareStale) || state.anim;
    stopAnimation();
    clearVis();
    state.single = null;
    if (state.compare) state.compareStale = true;
    state.view = { mode: "none", alg: state.view.alg };
    state.scenarioId = null;
    markScenario();
    toggleActive(null);
    renderBoard();
    setMetrics(null);
    renderCompare();
    if (message) setStatus("info", message.title, message.text);
    else if (hadResults) setStatus("info", "Mapa modificado", "Los resultados anteriores ya no son válidos. Vuelve a pulsar Ejecutar o Comparar todos.");
    else setStatus("info", "Editando mapa", describeBoard());
  }

  function describeBoard() {
    const g = state.grid;
    const goals = g.goals().length;
    const walls = g.cells.filter((c) => c.type === TYPE.WALL).length;
    const weights = g.cells.filter((c) => c.type === TYPE.WEIGHT).length;
    return `${g.start === null ? "Sin inicio" : "Inicio colocado"} · ${goals} meta(s) · ${walls} obstáculos · ${weights} baldosas con peso.`;
  }

  function applyTool(idx) {
    const g = state.grid;
    const r = g.rowOf(idx);
    const c = g.colOf(idx);
    let changed = false;
    switch (state.tool) {
      case "wall": changed = g.setWall(r, c); break;
      case "erase": changed = g.erase(r, c); break;
      case "weight": changed = g.setWeight(r, c, readWeight()); break;
      case "start":
        changed = g.setStart(r, c);
        if (!changed && g.cells[idx].type === TYPE.GOAL) setStatus("warn", "Celda ocupada", "El inicio no puede estar sobre una meta. Bórrala o mueve la meta primero.");
        break;
      case "goal":
        changed = g.setGoal(r, c, readPenalty());
        if (!changed && idx === g.start) setStatus("warn", "Celda ocupada", "Una meta no puede estar sobre el inicio.");
        break;
    }
    if (changed) boardChanged();
    return changed;
  }

  function idxFromPoint(e) {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const cell = t && t.closest ? t.closest(".cell") : null;
    return cell && ui.grid.contains(cell) ? Number(cell.dataset.idx) : -1;
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const idx = idxFromPoint(e);
    if (idx < 0) return;
    e.preventDefault();
    ui.grid.focus({ preventScroll: true });
    state.cursor = idx;
    ui.grid.setPointerCapture?.(e.pointerId);
    if (state.grid.isSpecial(idx) && state.tool !== "erase") {
      state.pointer = { mode: "move", from: idx, start: idx, moved: false };
    } else {
      state.pointer = { mode: "paint", last: idx };
      applyTool(idx);
      if (state.tool === "start" || state.tool === "goal") state.pointer = null;
    }
    renderCell(idx);
  }

  function onPointerMove(e) {
    const p = state.pointer;
    if (!p) return;
    const idx = idxFromPoint(e);
    if (idx < 0) return;
    if (p.mode === "paint" && idx !== p.last) {
      p.last = idx;
      applyTool(idx);
    } else if (p.mode === "move" && idx !== p.from) {
      if (state.grid.moveSpecial(p.from, state.grid.rowOf(idx), state.grid.colOf(idx))) {
        p.from = idx;
        p.moved = true;
        state.cursor = idx;
        boardChanged();
      }
    }
  }

  function onPointerUp() {
    const p = state.pointer;
    state.pointer = null;
    if (p && p.mode === "move" && !p.moved && state.tool === "goal" && state.grid.cells[p.from].type === TYPE.GOAL) {
      const g = state.grid;
      if (g.setGoal(g.rowOf(p.from), g.colOf(p.from), readPenalty())) boardChanged({ title: "Meta actualizada", text: `La meta (${g.rowOf(p.from)}, ${g.colOf(p.from)}) tiene ahora coste ${readPenalty()}.` });
    }
  }

  function onKeyDown(e) {
    const n = state.grid.size;
    const r = state.grid.rowOf(state.cursor);
    const c = state.grid.colOf(state.cursor);
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const toolKeys = { o: "wall", b: "erase", i: "start", m: "goal", p: "weight" };
    if (moves[e.key]) {
      e.preventDefault();
      const nr = Math.min(n - 1, Math.max(0, r + moves[e.key][0]));
      const nc = Math.min(n - 1, Math.max(0, c + moves[e.key][1]));
      const prev = state.cursor;
      state.cursor = state.grid.index(nr, nc);
      if (e.shiftKey) applyTool(state.cursor); // Mayús + flechas = pintar mientras se mueve
      renderCell(prev);
      renderCell(state.cursor);
      ui.toolHint.textContent = `Cursor en ${cellLabel(state.cursor)}. Herramienta: ${TOOL_NAMES[state.tool]}. Enter para aplicar.`;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      applyTool(state.cursor);
      renderCell(state.cursor);
    } else if (toolKeys[e.key.toLowerCase()]) {
      setTool(toolKeys[e.key.toLowerCase()]);
    }
  }

  function setTool(tool) {
    state.tool = tool;
    renderToolHint();
  }

  /* ======================================================= mapas y botones */
  function setGrid(grid, message) {
    state.grid = grid;
    state.compare = null;
    state.compareStale = false;
    state.cursor = Math.min(state.cursor, grid.size * grid.size - 1);
    boardChanged(message);
  }

  function loadScenarioUI(id) {
    const sc = SCENARIOS.find((s) => s.id === id);
    setGrid(loadScenario(id), { title: `Escenario ${id}: ${sc.title}`, text: `Pone a prueba: ${sc.tests} Esperado: ${sc.expected}` });
    state.scenarioId = id;
    markScenario();
  }

  function randomMap(seed) {
    const s = seed ?? Math.floor(Math.random() * 1e6);
    const goals = clampInt(ui.randomGoals.value, 1, 10, 2);
    const grid = Grid.random(s, { goals, maxWeight: Math.min(9, readWeight()), maxPenalty: readPenalty() });
    setGrid(grid, { title: "Mapa aleatorio preparado", text: `Semilla ${s} · ${goals} meta(s) con coste entre 0 y ${readPenalty()}. Puedes reproducirlo con ?semilla=${s}&metas=${goals}.` });
  }

  function clearBoard() {
    const g = new Grid();
    g.setStart(10, 2);
    g.setGoal(10, 17, 0);
    setGrid(g, { title: "Tablero limpio", text: "Solo quedan el inicio y una meta. Dibuja obstáculos, pesos o más metas." });
  }

  function bindEvents() {
    ui.grid.addEventListener("pointerdown", onPointerDown);
    ui.grid.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    ui.grid.addEventListener("keydown", onKeyDown);
    ui.grid.addEventListener("contextmenu", (e) => e.preventDefault());

    document.querySelectorAll(".tool").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
    ui.tileWeight.addEventListener("change", () => { ui.tileWeight.value = readWeight(); renderToolHint(); });
    ui.goalPenalty.addEventListener("change", () => (ui.goalPenalty.value = readPenalty()));
    ui.randomGoals.addEventListener("change", () => (ui.randomGoals.value = clampInt(ui.randomGoals.value, 1, 10, 2)));

    ui.algorithm.addEventListener("change", renderExplain);
    ui.speed.addEventListener("input", () => (ui.speedLabel.textContent = SPEEDS[Number(ui.speed.value) - 1].label));

    ui.btnEjecutar.addEventListener("click", () => runSelected());
    ui.btnComparar.addEventListener("click", () => runCompare());
    ui.btnPausar.addEventListener("click", () => pause());
    ui.btnAleatorio.addEventListener("click", () => randomMap());
    ui.btnMapaAleatorio.addEventListener("click", () => randomMap());
    ui.btnLimpiar.addEventListener("click", clearBoard);

    ui.btnAlternar.addEventListener("click", () => {
      if (!state.compare || state.compareStale) runCompare({ silent: true });
      if (!state.compare || ALGORITHMS.some((a) => state.compare[a].error)) return;
      const cur = state.view.mode === "compare" ? state.view.alg : null;
      const next = cur ? ALGORITHMS[(ALGORITHMS.indexOf(cur) + 1) % ALGORITHMS.length] : ui.routeSelect.value || "bfs";
      showCompareRoute(next);
    });
    ui.btnSuperponer.addEventListener("click", showOverlay);
    ui.routeSelect.addEventListener("change", () => {
      if (!state.compare || state.compareStale) runCompare({ silent: true });
      if (state.compare && !ALGORITHMS.some((a) => state.compare[a].error)) showCompareRoute(ui.routeSelect.value);
    });
  }

  /* ===================================================== parámetros de URL
   * Permiten reproducir un estado exacto (se usan para las capturas del informe):
   *   ?escenario=1..4 | ?semilla=N&metas=M | ?mapa=fila/fila/...&pen=G:0,H:5
   *   &alg=bfs|dfs|ucs|astar  &vel=1..5  &expl=0
   *   &guion=cmd;cmd  con cmd en: run | anim:N | compare | overlay | show:alg |
   *     wall:r,c | erase:r,c | weight:r,c,w | start:r,c | goal:r,c,p | tool:nombre
   */
  function applyUrl() {
    const q = new URLSearchParams(location.search);
    if (q.has("alg") && ALGORITHM_INFO[q.get("alg")]) ui.algorithm.value = q.get("alg");
    if (q.has("vel")) ui.speed.value = clampInt(q.get("vel"), 1, 5, 3);
    if (q.get("expl") === "0") ui.showExploration.checked = false;
    ui.speedLabel.textContent = SPEEDS[Number(ui.speed.value) - 1].label;
    renderExplain();

    if (q.has("mapa")) {
      const pen = {};
      (q.get("pen") || "").split(",").filter(Boolean).forEach((kv) => { const [k, v] = kv.split(":"); pen[k] = Number(v); });
      setGrid(Grid.fromAscii(q.get("mapa").split("/"), pen), { title: "Mapa cargado desde la URL", text: describeBoard() });
    } else if (q.has("semilla")) {
      ui.randomGoals.value = clampInt(q.get("metas"), 1, 10, 2);
      if (q.has("pen")) ui.goalPenalty.value = clampInt(q.get("pen"), 0, 999, 0);
      randomMap(clampInt(q.get("semilla"), 0, 1e9, 1));
    } else if (q.has("escenario")) {
      loadScenarioUI(clampInt(q.get("escenario"), 1, SCENARIOS.length, 1));
    } else {
      loadScenarioUI(1);
    }

    for (const cmd of (q.get("guion") || "").split(";").filter(Boolean)) {
      const [name, arg = ""] = cmd.split(":");
      const nums = arg.split(",").map(Number);
      const g = state.grid;
      const edit = (fn) => { if (fn()) boardChanged(); };
      switch (name) {
        case "run": runSelected({ instant: true }); break;
        case "anim": runSelected({ until: nums[0] }); break;
        case "compare": runCompare(); break;
        case "overlay": showOverlay(); break;
        case "show": showCompareRoute(arg); break;
        case "alg": ui.algorithm.value = arg; renderExplain(); break;
        case "tool": setTool(arg); break;
        case "wall": edit(() => g.setWall(nums[0], nums[1])); break;
        case "erase": edit(() => g.erase(nums[0], nums[1])); break;
        case "weight": edit(() => g.setWeight(nums[0], nums[1], nums[2])); break;
        case "start": edit(() => g.setStart(nums[0], nums[1])); break;
        case "goal": edit(() => g.setGoal(nums[0], nums[1], nums[2] || 0)); break;
      }
    }
  }

  /* ================================================================ inicio */
  buildBoard();
  renderScenarioButtons();
  renderToolHint();
  bindEvents();
  applyUrl();
  renderCompare();

  // Acceso para depuración desde la consola del navegador.
  window.LabApp = { state, runSelected, runCompare, loadScenario: loadScenarioUI, randomMap };
})();
