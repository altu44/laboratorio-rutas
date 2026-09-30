/*
 * algorithms.js — BFS, DFS, UCS (coste uniforme) y A*.
 *
 * Reglas comunes:
 *   - Movimiento ortogonal (N, E, S, O), sin diagonales. Orden fijo de vecinos:
 *     Norte, Este, Sur, Oeste -> resultados deterministas.
 *   - Coste de entrar en una celda: 1, o su peso si es ponderada.
 *   - Coste total = coste de la ruta + penalización de la meta alcanzada.
 *   - "Exploradas" = nodos sacados de la frontera y expandidos (incluida la meta).
 *   - Todas son búsquedas en grafo (no reexpanden nodos) y siempre terminan.
 *
 * Cada función es pura: recibe un Grid y devuelve un objeto resultado; no toca
 * el DOM. La traza (`trace`) permite a la interfaz animar la exploración.
 */
(function (Lab) {
  "use strict";

  const DIRS = [
    [-1, 0], // Norte
    [0, 1], // Este
    [1, 0], // Sur
    [0, -1], // Oeste
  ];

  const INFO = {
    bfs: {
      short: "BFS",
      name: "BFS · Búsqueda en anchura",
      structure: "Cola FIFO",
      criterion: "Expande por niveles: primero todo lo que está a 1 paso, luego a 2, etc.",
      guarantee: "Ruta con el MENOR número de pasos. Ignora pesos y penalizaciones.",
      text: "Explora en ondas desde el inicio usando una cola (el primero que entra es el primero que sale). Garantiza la ruta con menos pasos, pero no la más barata cuando hay pesos o metas con penalización.",
    },
    dfs: {
      short: "DFS",
      name: "DFS · Búsqueda en profundidad",
      structure: "Pila LIFO",
      criterion: "Avanza todo lo posible por una rama (orden N, E, S, O) y retrocede al llegar a un callejón.",
      guarantee: "Encuentra una ruta si existe, pero NO garantiza ni la más corta ni la más barata.",
      text: "Usa una pila (el último que entra es el primero que sale). Se adentra por la primera dirección disponible (Norte) hasta el fondo y solo retrocede cuando no puede seguir, por eso suele devolver rodeos largos.",
    },
    ucs: {
      short: "UCS",
      name: "UCS · Coste uniforme",
      structure: "Cola de prioridad por g(n)",
      criterion: "Expande siempre el nodo con menor coste acumulado g(n) desde el inicio.",
      guarantee: "Ruta de MENOR coste total (pesos + penalización de la meta).",
      text: "Es el algoritmo de Dijkstra aplicado a la búsqueda de una meta: saca de la cola de prioridad el nodo con menor g(n). Tiene en cuenta los pesos de las baldosas y la penalización de cada meta, por lo que su resultado es óptimo en coste.",
    },
    astar: {
      short: "A*",
      name: "A* · Búsqueda heurística",
      structure: "Cola de prioridad por f(n) = g(n) + h(n)",
      criterion: "g(n) = coste real acumulado; h(n) = mín. sobre las metas de (Manhattan + penalización).",
      guarantee: "Ruta de MENOR coste total, normalmente explorando menos celdas que UCS.",
      text: "Añade a UCS una estimación h(n) de lo que falta. Como cada paso cuesta como mínimo 1, la distancia Manhattan nunca sobreestima (heurística admisible y consistente), así que A* devuelve el mismo coste óptimo que UCS pero dirigiéndose hacia las metas.",
    },
  };

  function neighbors(grid, idx) {
    const r = grid.rowOf(idx);
    const c = grid.colOf(idx);
    const out = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (grid.inBounds(nr, nc)) {
        const n = grid.index(nr, nc);
        if (grid.isPassable(n)) out.push(n);
      }
    }
    return out;
  }

  function reconstruct(parent, goalIdx) {
    const path = [];
    for (let cur = goalIdx; cur !== -1; cur = parent[cur]) path.push(cur);
    return path.reverse();
  }

  /** Construye el objeto resultado a partir del estado final de una búsqueda. */
  function buildResult(algorithm, grid, parent, goalIdx, trace, maxFrontier) {
    const base = {
      algorithm,
      name: INFO[algorithm].name,
      error: null,
      explored: trace.length,
      trace,
      maxFrontier,
    };
    if (goalIdx === null) {
      return { ...base, found: false, goal: null, path: [], steps: null, pathCost: null, penalty: null, totalCost: null };
    }
    const path = reconstruct(parent, goalIdx);
    let pathCost = 0;
    for (let i = 1; i < path.length; i++) pathCost += grid.enterCost(path[i]);
    const penalty = grid.cells[goalIdx].penalty;
    return {
      ...base,
      found: true,
      goal: { idx: goalIdx, row: grid.rowOf(goalIdx), col: grid.colOf(goalIdx), penalty },
      path,
      steps: path.length - 1,
      pathCost,
      penalty,
      totalCost: pathCost + penalty,
    };
  }

  function errorResult(algorithm, errors) {
    return {
      algorithm,
      name: INFO[algorithm].name,
      error: errors.join(" "),
      found: false,
      goal: null,
      path: [],
      steps: null,
      pathCost: null,
      penalty: null,
      totalCost: null,
      explored: 0,
      trace: [],
      maxFrontier: 0,
    };
  }

  const isGoal = (grid, idx) => grid.cells[idx].type === Lab.TYPE.GOAL;

  /* ------------------------------------------------------------------ BFS */
  function bfs(grid) {
    const n = grid.cells.length;
    const parent = new Array(n).fill(-1);
    const discovered = new Array(n).fill(false);
    const queue = [grid.start];
    let head = 0;
    const trace = [];
    let maxFrontier = 1;
    discovered[grid.start] = true;

    while (head < queue.length) {
      const cur = queue[head++]; // sacar el primero (FIFO)
      const step = { cell: cur, added: [] };
      trace.push(step);
      if (isGoal(grid, cur)) return buildResult("bfs", grid, parent, cur, trace, maxFrontier);

      for (const nb of neighbors(grid, cur)) {
        if (!discovered[nb]) {
          discovered[nb] = true;
          parent[nb] = cur;
          queue.push(nb);
          step.added.push(nb);
        }
      }
      maxFrontier = Math.max(maxFrontier, queue.length - head);
    }
    return buildResult("bfs", grid, parent, null, trace, maxFrontier);
  }

  /* ------------------------------------------------------------------ DFS */
  function dfs(grid) {
    const n = grid.cells.length;
    const parent = new Array(n).fill(-1);
    const visited = new Array(n).fill(false);
    const stack = [[grid.start, -1]];
    const trace = [];
    let maxFrontier = 1;

    while (stack.length) {
      const [cur, par] = stack.pop(); // sacar el último (LIFO)
      if (visited[cur]) continue;
      visited[cur] = true;
      parent[cur] = par;
      const step = { cell: cur, added: [] };
      trace.push(step);
      if (isGoal(grid, cur)) return buildResult("dfs", grid, parent, cur, trace, maxFrontier);

      // Se apilan en orden inverso para que el primero en salir sea el Norte.
      const nbs = neighbors(grid, cur);
      for (let i = nbs.length - 1; i >= 0; i--) {
        if (!visited[nbs[i]]) {
          stack.push([nbs[i], cur]);
          step.added.push(nbs[i]);
        }
      }
      maxFrontier = Math.max(maxFrontier, stack.length);
    }
    return buildResult("dfs", grid, parent, null, trace, maxFrontier);
  }

  /* ------------------------------------------------------ UCS y A* (común) */
  /**
   * Búsqueda de mejor-primero con cola de prioridad.
   * Varias metas con penalización: al expandir una meta NO se termina todavía;
   * se inserta un "nodo final" con prioridad g(meta) + penalización. La búsqueda
   * termina cuando ese nodo final sale de la cola, es decir, cuando ya no puede
   * existir otra alternativa más barata. Equivale a añadir un nodo virtual
   * "FIN" unido a cada meta con un arco de coste = penalización.
   */
  function bestFirst(algorithm, grid, heuristic) {
    const n = grid.cells.length;
    const parent = new Array(n).fill(-1);
    const g = new Array(n).fill(Infinity);
    const closed = new Array(n).fill(false);
    const pq = new Lab.PriorityQueue();
    const trace = [];
    let maxFrontier = 1;

    g[grid.start] = 0;
    pq.push({ cell: grid.start, final: false }, heuristic(grid.start), heuristic(grid.start));

    while (pq.size) {
      const entry = pq.pop();
      const cur = entry.cell;
      if (entry.final) return buildResult(algorithm, grid, parent, cur, trace, maxFrontier);
      if (closed[cur]) continue; // entrada obsoleta
      closed[cur] = true;
      const step = { cell: cur, added: [] };
      trace.push(step);

      if (isGoal(grid, cur)) {
        const total = g[cur] + grid.cells[cur].penalty;
        pq.push({ cell: cur, final: true }, total, -1);
      }

      for (const nb of neighbors(grid, cur)) {
        if (closed[nb]) continue;
        const ng = g[cur] + grid.enterCost(nb);
        if (ng < g[nb]) {
          g[nb] = ng;
          parent[nb] = cur;
          const h = heuristic(nb);
          pq.push({ cell: nb, final: false }, ng + h, h);
          step.added.push(nb);
        }
      }
      maxFrontier = Math.max(maxFrontier, pq.size);
    }
    return buildResult(algorithm, grid, parent, null, trace, maxFrontier);
  }

  function ucs(grid) {
    return bestFirst("ucs", grid, () => 0);
  }

  /**
   * Heurística para varias metas: h(n) = min_m ( Manhattan(n, m) + penalización(m) ).
   * Es admisible y consistente porque cada movimiento cuesta al menos 1.
   */
  function makeHeuristic(grid) {
    const goals = grid.goals();
    const cache = new Map();
    return function (idx) {
      if (cache.has(idx)) return cache.get(idx);
      const r = grid.rowOf(idx);
      const c = grid.colOf(idx);
      let best = Infinity;
      for (const m of goals) best = Math.min(best, Math.abs(r - m.row) + Math.abs(c - m.col) + m.penalty);
      cache.set(idx, best);
      return best;
    };
  }

  function astar(grid) {
    return bestFirst("astar", grid, makeHeuristic(grid));
  }

  const RUNNERS = { bfs, dfs, ucs, astar };
  const ORDER = ["bfs", "dfs", "ucs", "astar"];

  /** Punto de entrada: valida el tablero, ejecuta y mide el tiempo. */
  function run(algorithm, grid) {
    if (!RUNNERS[algorithm]) throw new Error(`Algoritmo desconocido: ${algorithm}`);
    const errors = grid.validate();
    if (errors.length) return errorResult(algorithm, errors);
    const t0 = performance.now();
    const result = RUNNERS[algorithm](grid);
    result.timeMs = performance.now() - t0;
    return result;
  }

  function runAll(grid) {
    const out = {};
    for (const a of ORDER) out[a] = run(a, grid);
    return out;
  }

  Lab.ALGORITHMS = ORDER;
  Lab.ALGORITHM_INFO = INFO;
  Lab.neighbors = neighbors;
  Lab.makeHeuristic = makeHeuristic;
  Lab.search = { run, runAll, bfs, dfs, ucs, astar };
})((globalThis.Lab = globalThis.Lab || {}));
