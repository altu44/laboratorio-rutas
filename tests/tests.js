/*
 * tests.js — Batería de pruebas del laboratorio (se ejecuta en el navegador).
 * Abre tests/tests.html: cada caso muestra entrada, resultado esperado,
 * resultado obtenido y si la prueba pasa.
 */
(function () {
  "use strict";

  const { Grid, search, SCENARIOS, loadScenario, ALGORITHMS, ALGORITHM_INFO } = Lab;
  const cases = [];

  function test(id, title, input, expected, fn) {
    let obtained;
    let pass;
    try {
      const r = fn();
      obtained = r.obtained;
      pass = !!r.pass;
    } catch (e) {
      obtained = "EXCEPCIÓN: " + e.message;
      pass = false;
    }
    cases.push({ id, title, input, expected, obtained, pass });
  }

  const fmt = (r) =>
    r.error
      ? `error: "${r.error}"`
      : r.found
        ? `meta (${r.goal.row},${r.goal.col}) · ${r.steps} pasos · coste ${r.pathCost}+${r.penalty}=${r.totalCost} · ${r.explored} exploradas`
        : `sin ruta · ${r.explored} exploradas`;
  const fmtAll = (res) => ALGORITHMS.map((a) => `${ALGORITHM_INFO[a].short}: ${fmt(res[a])}`).join("\n");

  /** Comprueba que una ruta es válida: empieza en S, acaba en meta, pasos ortogonales, sin muros. */
  function validPath(grid, r) {
    if (!r.found) return true;
    const p = r.path;
    if (p[0] !== grid.start) return false;
    if (grid.cells[p[p.length - 1]].type !== Lab.TYPE.GOAL) return false;
    for (let i = 0; i < p.length; i++) {
      if (!grid.isPassable(p[i])) return false;
      if (i > 0) {
        const d = Math.abs(grid.rowOf(p[i]) - grid.rowOf(p[i - 1])) + Math.abs(grid.colOf(p[i]) - grid.colOf(p[i - 1]));
        if (d !== 1) return false;
      }
    }
    return true;
  }

  /** Nº de celdas alcanzables desde el inicio (relleno por inundación). */
  function reachable(grid) {
    const seen = new Set([grid.start]);
    const stack = [grid.start];
    while (stack.length) for (const n of Lab.neighbors(grid, stack.pop())) if (!seen.has(n)) (seen.add(n), stack.push(n));
    return seen.size;
  }

  /* ------------------------------------------------------------------ */
  test(
    "T01",
    "Ruta simple",
    "Tablero vacío. Inicio (0,0), meta (0,5) sin penalización.",
    "Los 4 algoritmos: ruta de 5 pasos, coste total 5.",
    () => {
      const g = new Grid();
      g.setStart(0, 0);
      g.setGoal(0, 5, 0);
      const res = search.runAll(g);
      const pass = ALGORITHMS.every((a) => res[a].found && res[a].steps === 5 && res[a].totalCost === 5 && validPath(g, res[a]));
      return { obtained: fmtAll(res), pass };
    }
  );

  test(
    "T02",
    "Ausencia de inicio",
    "Tablero con una meta en (5,5) y sin inicio.",
    'No se ejecuta: error "Falta el inicio" en los 4 algoritmos, 0 exploradas.',
    () => {
      const g = new Grid();
      g.setGoal(5, 5, 0);
      const res = search.runAll(g);
      const pass = ALGORITHMS.every((a) => !res[a].found && /Falta el inicio/.test(res[a].error) && res[a].explored === 0);
      return { obtained: fmtAll(res), pass };
    }
  );

  test(
    "T03",
    "Ausencia de meta",
    "Tablero con inicio en (5,5) y sin metas.",
    'No se ejecuta: error "Falta la meta" en los 4 algoritmos, 0 exploradas.',
    () => {
      const g = new Grid();
      g.setStart(5, 5);
      const res = search.runAll(g);
      const pass = ALGORITHMS.every((a) => !res[a].found && /Falta la meta/.test(res[a].error) && res[a].explored === 0);
      return { obtained: fmtAll(res), pass };
    }
  );

  test(
    "T04",
    "Varias metas",
    "Escenario 3: G(10,6) +25, H(2,17) +0, I(18,17) +5. Inicio (10,2).",
    "BFS → G (4 pasos, total 29). UCS y A* → H (23 pasos, total 23).",
    () => {
      const g = loadScenario(3);
      const res = search.runAll(g);
      const at = (r, row, col) => r.found && r.goal.row === row && r.goal.col === col;
      const pass =
        at(res.bfs, 10, 6) && res.bfs.steps === 4 && res.bfs.totalCost === 29 &&
        at(res.ucs, 2, 17) && res.ucs.totalCost === 23 &&
        at(res.astar, 2, 17) && res.astar.totalCost === 23;
      return { obtained: fmtAll(res), pass };
    }
  );

  test(
    "T05",
    "Pesos",
    "Escenario 2: pasillo recto de 14 baldosas de peso 5 frente a rodeo sin pesos.",
    "BFS: 17 pasos, coste 73 (pasillo). UCS y A*: 21 pasos, coste 21 (rodeo).",
    () => {
      const g = loadScenario(2);
      const res = search.runAll(g);
      const pass =
        res.bfs.steps === 17 && res.bfs.totalCost === 73 &&
        res.ucs.steps === 21 && res.ucs.totalCost === 21 &&
        res.astar.steps === 21 && res.astar.totalCost === 21;
      return { obtained: fmtAll(res), pass };
    }
  );

  test(
    "T06",
    "Obstáculos",
    "Muro en la columna 10 (filas 0-18, hueco en la fila 19). Inicio (10,0), meta (10,19).",
    "Todos encuentran ruta que rodea el muro por la fila 19 sin pisar obstáculos. BFS/UCS/A*: 37 pasos. DFS: ≥ 37.",
    () => {
      const g = new Grid();
      for (let r = 0; r <= 18; r++) g.setWall(r, 10);
      g.setStart(10, 0);
      g.setGoal(10, 19, 0);
      const res = search.runAll(g);
      const pass =
        ALGORITHMS.every((a) => res[a].found && validPath(g, res[a]) && res[a].path.includes(g.index(19, 10))) &&
        res.bfs.steps === 37 && res.ucs.steps === 37 && res.astar.steps === 37 && res.dfs.steps >= 37;
      return { obtained: fmtAll(res), pass };
    }
  );

  test(
    "T07",
    "Mapa sin solución",
    "Escenario 4: barrera completa en la columna 10; metas en la mitad derecha.",
    "Los 4 terminan con found = false y exploran exactamente todas las celdas alcanzables.",
    () => {
      const g = loadScenario(4);
      const res = search.runAll(g);
      const total = reachable(g);
      const pass = ALGORITHMS.every((a) => !res[a].found && !res[a].error && res[a].explored === total);
      return { obtained: `celdas alcanzables = ${total}\n` + fmtAll(res), pass };
    }
  );

  test(
    "T08",
    "Edición del tablero tras ejecutar",
    "Escenario 1 → ejecutar BFS y UCS; después se pone un muro en (10,9) (sobre la ruta) y se vuelve a ejecutar.",
    "1ª ejecución: 17 pasos. 2ª: la ruta ya no pasa por (10,9) y tiene 19 pasos. El resultado anterior no se modifica.",
    () => {
      const g = loadScenario(1);
      const before = search.runAll(g);
      const copyPath = before.bfs.path.slice();
      const wall = g.index(10, 9);
      const changed = g.setWall(10, 9);
      const after = search.runAll(g);
      const pass =
        changed && before.bfs.steps === 17 && before.ucs.steps === 17 && before.bfs.path.includes(wall) &&
        after.bfs.steps === 19 && after.ucs.steps === 19 && !after.bfs.path.includes(wall) && !after.ucs.path.includes(wall) &&
        JSON.stringify(copyPath) === JSON.stringify(before.bfs.path);
      return {
        obtained: `antes → BFS ${before.bfs.steps} pasos, UCS ${before.ucs.steps} pasos\ndespués → BFS ${after.bfs.steps} pasos, UCS ${after.ucs.steps} pasos; ruta pisa (10,9): ${after.bfs.path.includes(wall)}`,
        pass,
      };
    }
  );

  test(
    "T09",
    "Coherencia del tablero",
    "Intentar: muro sobre meta, inicio sobre meta, meta sobre inicio, segundo inicio, penalización -3, peso 0.",
    "Se rechazan los estados incoherentes; solo existe un inicio; penalización → 0; peso → 2 (mínimo).",
    () => {
      const g = new Grid();
      g.setStart(1, 1);
      g.setGoal(2, 2, 4);
      const wallOnGoal = g.setWall(2, 2);
      const startOnGoal = g.setStart(2, 2);
      const goalOnStart = g.setGoal(1, 1, 0);
      g.setStart(3, 3); // mueve el inicio
      g.setGoal(4, 4, -3);
      g.setWeight(5, 5, 0);
      const starts = g.cells.filter((c) => c.type === "start").length;
      const pass =
        !wallOnGoal && !startOnGoal && !goalOnStart && starts === 1 && g.start === g.index(3, 3) &&
        g.cellAt(1, 1).type === "empty" && g.cellAt(2, 2).type === "goal" &&
        g.cellAt(4, 4).penalty === 0 && g.cellAt(5, 5).weight === 2;
      return {
        obtained: `muro sobre meta: ${wallOnGoal}; inicio sobre meta: ${startOnGoal}; meta sobre inicio: ${goalOnStart}; nº inicios: ${starts} en (3,3); penalización: ${g.cellAt(4, 4).penalty}; peso: ${g.cellAt(5, 5).weight}`,
        pass,
      };
    }
  );

  test(
    "T10",
    "Penalización de la meta",
    "Tablero vacío, inicio (0,0), una meta (0,3) con penalización 7.",
    "Los 4: 3 pasos, coste ruta 3, coste total 3 + 7 = 10.",
    () => {
      const g = new Grid();
      g.setStart(0, 0);
      g.setGoal(0, 3, 7);
      const res = search.runAll(g);
      const pass = ALGORITHMS.every((a) => res[a].steps === 3 && res[a].pathCost === 3 && res[a].totalCost === 10);
      return { obtained: fmtAll(res), pass };
    }
  );

  test(
    "T11",
    "UCS y A* coinciden en coste óptimo",
    "Los 4 escenarios + 500 mapas aleatorios con semilla (1..500), pesos 2-9, 1-4 metas con penalización 0-10.",
    "En todos los mapas UCS y A* obtienen el mismo coste total (o ambos sin ruta) y ninguno mejora al otro.",
    () => {
      let checked = 0;
      let mismatches = 0;
      let aStarLess = 0;
      const grids = SCENARIOS.map((s) => loadScenario(s.id));
      for (let seed = 1; seed <= 500; seed++) grids.push(Grid.random(seed, { goals: 1 + (seed % 4) }));
      for (const g of grids) {
        const u = search.run("ucs", g);
        const a = search.run("astar", g);
        checked++;
        if (u.found !== a.found || u.totalCost !== a.totalCost || !validPath(g, u) || !validPath(g, a)) mismatches++;
        if (a.explored <= u.explored) aStarLess++;
      }
      return {
        obtained: `mapas comprobados: ${checked}; discrepancias de coste: ${mismatches}; A* exploró ≤ celdas que UCS en ${aStarLess}/${checked}`,
        pass: mismatches === 0,
      };
    }
  );

  test(
    "T12",
    "Movimiento ortogonal y rutas válidas",
    "Las rutas de los 4 algoritmos en 200 mapas aleatorios.",
    "Todas las rutas empiezan en S, terminan en una meta, avanzan de 1 en 1 sin diagonales y no pisan muros. BFS nunca tiene más pasos que otro algoritmo.",
    () => {
      let bad = 0;
      let bfsWorse = 0;
      let routes = 0;
      for (let seed = 1000; seed < 1200; seed++) {
        const g = Grid.random(seed, { goals: 2 });
        const res = search.runAll(g);
        for (const a of ALGORITHMS) {
          if (res[a].found) routes++;
          if (!validPath(g, res[a])) bad++;
          if (res[a].found && res.bfs.steps > res[a].steps) bfsWorse++;
        }
      }
      return { obtained: `rutas comprobadas: ${routes}; inválidas: ${bad}; casos con BFS más largo: ${bfsWorse}`, pass: bad === 0 && bfsWorse === 0 };
    }
  );

  test(
    "T13",
    "Binary Search y cola de prioridad",
    "binarySearch([1,3,5,7,9,11], x) para x = 7, 1, 11, 4. Cola: push(A,5) push(B,2) push(C,5) push(D,1).",
    "Índices 3, 0, 5, -1. Orden de salida D, B, A, C (empate A/C → FIFO).",
    () => {
      const arr = [1, 3, 5, 7, 9, 11];
      const idx = [7, 1, 11, 4].map((x) => Lab.binarySearch(arr, x));
      const pq = new Lab.PriorityQueue();
      pq.push("A", 5);
      pq.push("B", 2);
      pq.push("C", 5);
      pq.push("D", 1);
      const order = [pq.pop(), pq.pop(), pq.pop(), pq.pop()].join(", ");
      return { obtained: `índices ${idx.join(", ")} · orden ${order}`, pass: idx.join() === "3,0,5,-1" && order === "D, B, A, C" };
    }
  );

  test(
    "T14",
    "Reproducibilidad",
    "Cargar dos veces cada escenario y generar dos veces el mapa aleatorio de semilla 42.",
    "Mismo tablero y mismos resultados (pasos, coste, exploradas) en ambas cargas.",
    () => {
      let same = true;
      for (const s of SCENARIOS) {
        const r1 = search.runAll(loadScenario(s.id));
        const r2 = search.runAll(loadScenario(s.id));
        for (const a of ALGORITHMS) same = same && r1[a].totalCost === r2[a].totalCost && r1[a].explored === r2[a].explored && r1[a].steps === r2[a].steps;
      }
      const m1 = JSON.stringify(Grid.random(42, { goals: 3 }).toAscii());
      const m2 = JSON.stringify(Grid.random(42, { goals: 3 }).toAscii());
      return { obtained: `escenarios idénticos: ${same}; semilla 42 idéntica: ${m1 === m2}`, pass: same && m1 === m2 };
    }
  );

  /* -------------------------------------------- tabla de los escenarios */
  const scenarioRows = [];
  for (const s of SCENARIOS) {
    const g = loadScenario(s.id);
    const res = search.runAll(g);
    for (const a of ALGORITHMS) {
      const r = res[a];
      scenarioRows.push({
        scenario: `${s.id}. ${s.title}`,
        algorithm: ALGORITHM_INFO[a].short,
        goal: r.found ? `(${r.goal.row},${r.goal.col}) +${r.penalty}` : "—",
        steps: r.found ? r.steps : "—",
        explored: r.explored,
        cost: r.found ? `${r.pathCost} + ${r.penalty} = ${r.totalCost}` : "sin ruta",
      });
    }
  }

  /* ------------------------------------------------------------- render */
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const passed = cases.filter((c) => c.pass).length;
  document.getElementById("summary").innerHTML =
    `<strong class="${passed === cases.length ? "ok" : "ko"}">${passed} / ${cases.length} pruebas superadas</strong> · ${new Date().toLocaleString("es-ES")}`;
  document.getElementById("cases").innerHTML = cases
    .map(
      (c) => `<tr class="${c.pass ? "ok" : "ko"}">
        <td><b>${c.id}</b></td><td><b>${esc(c.title)}</b></td><td>${esc(c.input)}</td>
        <td>${esc(c.expected)}</td><td><pre>${esc(c.obtained)}</pre></td>
        <td class="verdict">${c.pass ? "✔ PASA" : "✘ FALLA"}</td></tr>`
    )
    .join("");
  document.getElementById("scenarios").innerHTML = scenarioRows
    .map((r) => `<tr><td>${esc(r.scenario)}</td><td><b>${r.algorithm}</b></td><td>${esc(r.goal)}</td><td>${r.steps}</td><td>${r.explored}</td><td>${esc(r.cost)}</td></tr>`)
    .join("");
  document.getElementById("json").textContent = JSON.stringify({ passed, total: cases.length, cases, scenarioRows });
})();
