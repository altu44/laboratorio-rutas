/*
 * scenarios.js — Los cuatro escenarios diseñados, cargables de forma reproducible.
 *
 * Leyenda del texto:
 *   '.' vacío   '#' obstáculo   'S' inicio   '2'..'9' baldosa con peso
 *   'G', 'H', 'I' metas (su penalización se indica en `penalties`)
 */
(function (Lab) {
  "use strict";

  const SCENARIOS = [
    {
      id: 1,
      title: "Menos pasos",
      subtitle: "Sin pesos · atajo recto vs. rodeo",
      tests: "Desvíos y caminos de distinta longitud, sin pesos.",
      expected: "BFS encuentra la ruta de pasos mínimos (recta por la fila central); DFS, que prueba primero el Norte, se mete por el pasillo superior y devuelve un rodeo mucho más largo.",
      map: [
        "....................",
        ".##################.",
        ".#................#.",
        ".#................#.",
        ".#....########....#.",
        ".#....#......#....#.",
        ".#....#......#....#.",
        ".#....#......#....#.",
        ".#....########....#.",
        ".#................#.",
        ".S................G.",
        ".#................#.",
        ".#....########....#.",
        ".#....#......#....#.",
        ".#....#......#....#.",
        ".#....#......#....#.",
        ".#....########....#.",
        ".#................#.",
        ".##################.",
        "....................",
      ],
      penalties: { G: 0 },
    },
    {
      id: 2,
      title: "Atajo caro",
      subtitle: "Pasillo corto de peso 5 vs. rodeo barato",
      tests: "Ruta corta con baldosas de coste alto frente a un rodeo barato.",
      expected: "UCS y A* prefieren el rodeo (menos coste aunque más pasos); BFS elige el pasillo recto (menos pasos aunque mucho más caro).",
      map: [
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "..################..",
        ".S.55555555555555.G.",
        "..################..",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
      ],
      penalties: { G: 0 },
    },
    {
      id: 3,
      title: "Varias metas",
      subtitle: "Meta cercana penalizada vs. lejana barata",
      tests: "Meta cercana con penalización alta y otras más lejanas y baratas.",
      expected: "BFS se queda con la meta más cercana en pasos (G, +25). UCS y A* comparan coste total = ruta + penalización y eligen H (23 + 0), más barata que G (4 + 25) e I (23 + 5).",
      map: [
        "....................",
        "....................",
        ".................H..",
        "....................",
        "....................",
        "............#.......",
        "............#.......",
        "............#.......",
        "............#.......",
        "............#.......",
        "..S...G.....#.......",
        "............#.......",
        "............#.......",
        "............#.......",
        "............#.......",
        "............#.......",
        "....................",
        "....................",
        ".................I..",
        "....................",
      ],
      penalties: { G: 25, H: 0, I: 5 },
    },
    {
      id: 4,
      title: "Sin solución",
      subtitle: "Barrera completa de obstáculos",
      tests: "Una barrera de obstáculos impide alcanzar cualquier meta.",
      expected: "Los cuatro algoritmos exploran toda la zona alcanzable (mitad izquierda), terminan e informan de que no existe ruta.",
      map: [
        "..........#.........",
        "..........#.........",
        "..........#.........",
        "..........#.........",
        "....###...#....H....",
        "......#...#.........",
        "......#...#.........",
        "..........#.........",
        "..........#.........",
        "..........#.........",
        "...S......#.........",
        "..........#.........",
        "..........#.........",
        "......#...#.........",
        "......#...#.........",
        "....###...#.....G...",
        "..........#.........",
        "..........#.........",
        "..........#.........",
        "..........#.........",
      ],
      penalties: { G: 2, H: 0 },
    },
  ];

  function load(id) {
    const sc = SCENARIOS.find((s) => s.id === Number(id));
    if (!sc) throw new Error(`Escenario ${id} no existe`);
    return Lab.Grid.fromAscii(sc.map, sc.penalties);
  }

  Lab.SCENARIOS = SCENARIOS;
  Lab.loadScenario = load;
})((globalThis.Lab = globalThis.Lab || {}));
