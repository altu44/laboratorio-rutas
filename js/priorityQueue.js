/*
 * priorityQueue.js — Búsqueda binaria (Binary Search) y cola de prioridad.
 *
 * UCS y A* necesitan sacar siempre el nodo de MENOR prioridad. En lugar de
 * recorrer toda la lista en cada extracción (O(n), como en el proyecto base),
 * mantenemos la lista ORDENADA y usamos búsqueda binaria para localizar en
 * O(log n) la posición donde insertar cada elemento nuevo.
 *
 * La lista se guarda de peor a mejor: el mejor elemento está al final y
 * extraerlo con pop() es O(1).
 */
(function (Lab) {
  "use strict";

  /**
   * Búsqueda binaria clásica: devuelve el índice de `target` en un array
   * ordenado ascendentemente o -1 si no está. Se incluye como referencia
   * teórica y se prueba en tests/.
   */
  function binarySearch(sorted, target) {
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] === target) return mid;
      if (sorted[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  /**
   * Variante "lower bound": primer índice i en [0, n] tal que before(arr[i]) es
   * falso, suponiendo que el array está particionado (primero los true).
   */
  function lowerBound(arr, before) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (before(arr[mid])) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Cola de prioridad mínima y estable.
   * Orden de salida: menor `priority`, después menor `tie` (desempate) y,
   * si todo empata, el que se insertó antes (FIFO). Esto hace que los
   * resultados sean deterministas y reproducibles.
   */
  class PriorityQueue {
    constructor() {
      this.items = []; // ordenados de PEOR a MEJOR
      this.seq = 0;
    }

    static rank(a, b) {
      // < 0 si `a` debe salir antes que `b`
      return a.priority - b.priority || a.tie - b.tie || a.seq - b.seq;
    }

    push(value, priority, tie = 0) {
      const entry = { value, priority, tie, seq: this.seq++ };
      // Todos los que deben salir DESPUÉS del nuevo van a su izquierda.
      const pos = lowerBound(this.items, (it) => PriorityQueue.rank(it, entry) > 0);
      this.items.splice(pos, 0, entry);
    }

    pop() {
      const e = this.items.pop();
      return e ? e.value : undefined;
    }

    peekPriority() {
      const e = this.items[this.items.length - 1];
      return e ? e.priority : Infinity;
    }

    get size() {
      return this.items.length;
    }
  }

  Lab.binarySearch = binarySearch;
  Lab.lowerBound = lowerBound;
  Lab.PriorityQueue = PriorityQueue;
})((globalThis.Lab = globalThis.Lab || {}));
