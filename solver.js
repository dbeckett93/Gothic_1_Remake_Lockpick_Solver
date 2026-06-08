/*
 * Gothic 1 Remake — Lockpick Solver (core logic)
 * --------------------------------------------------
 * A "lock" is a set of N plates. Each plate sits at one of 7 pin positions
 * (internally 0..6, where 3 == pin 4 == the target / centre).
 *
 * Moving a plate one notch left/right also nudges *coupled* plates by exactly
 * one notch, possibly inverted. The coupling is an N x N effect matrix:
 *
 *     effect[i][j] = how far plate j moves when plate i is pushed RIGHT (+1)
 *
 * effect[i][i] is +1 (the plate you grab moves the way you push it). Pushing
 * plate i LEFT applies the negation of row i (the linkage is symmetric per move).
 * Couplings are one-hop (no chaining) and values are in {-1, 0, +1}.
 *
 * Edge behaviour (what happens at pins 1 and 7), matching the real game:
 *   'block' : if the move would push ANY affected pin off an edge, the whole
 *             move is refused (atomic). THIS IS THE REAL GOTHIC MECHANIC.
 *   'wrap'  : positions wrap around mod 7 (non-canonical / experimental).
 *   'clamp' : each pin clamps independently at the edge. NOT how Gothic behaves
 *             (it invents transitions the game disallows); kept only for tests.
 *
 * The lock is solved when every plate reaches pin 4.
 *
 * Solvers (both exact & optimal at this scale, N <= 7 => 7^N <= 823,543):
 *   objective 'moves'    : plain BFS  -> fewest total notch-moves.
 *   objective 'switches' : 0-1 BFS    -> fewest plate selections (a "switch" is
 *                          changing which plate you nudge; in-game that's the
 *                          slow action). Plain BFS would give the WRONG optimum
 *                          here, so this uses a deque-based 0-1 BFS over an
 *                          augmented (state, last-plate) graph.
 *
 * Plain <script> include (no build, no modules) so it runs from file:// anywhere.
 */
(function (root) {
  'use strict';

  var POS = 7;          // pin positions per plate
  var TARGET_POS = 3;   // 0-indexed -> pin 4

  // ---- state <-> integer index (base-7, little-endian over plates) ----------
  function encode(state) {
    var idx = 0;
    for (var i = state.length - 1; i >= 0; i--) idx = idx * POS + state[i];
    return idx;
  }
  function decode(idx, n) {
    var s = new Array(n);
    for (var i = 0; i < n; i++) { var r = idx % POS; s[i] = r; idx = (idx - r) / POS; }
    return s;
  }
  function defaultTarget(n) {
    var t = new Array(n);
    for (var i = 0; i < n; i++) t[i] = TARGET_POS;
    return t;
  }
  function isSolved(state, target) {
    target = target || defaultTarget(state.length);
    for (var i = 0; i < state.length; i++) if (state[i] !== target[i]) return false;
    return true;
  }
  function countSwitches(moves) {
    if (!moves || moves.length === 0) return 0;
    var sw = 1;
    for (var i = 1; i < moves.length; i++) if (moves[i].plate !== moves[i - 1].plate) sw++;
    return sw;
  }

  /*
   * Apply one move to `state` (does not mutate it).
   *   plate, dir(+1/-1), effect (N x N), edge ('block'|'wrap'|'clamp')
   * Returns the resulting state array, or null if the move is illegal.
   */
  function applyMove(state, plate, dir, effect, edge) {
    var n = state.length;
    var next = state.slice();
    var row = effect[plate];
    for (var j = 0; j < n; j++) {
      var delta = dir * row[j];
      if (!delta) continue;
      var v = next[j] + delta;
      if (edge === 'wrap') {
        v = ((v % POS) + POS) % POS;
      } else if (v < 0 || v > POS - 1) {
        if (edge === 'clamp') { v = v < 0 ? 0 : POS - 1; }
        else return null; // 'block' (default): atomic refusal
      }
      next[j] = v;
    }
    return next;
  }

  // ---- fewest total moves: plain BFS ----------------------------------------
  function solveMoves(start, effect, edge, target, maxStates) {
    var n = start.length;
    var total = Math.pow(POS, n);
    if (total > maxStates) return { status: 'too-large', total: total };

    var startIdx = encode(start);
    var targetIdx = encode(target);
    if (startIdx === targetIdx) return { status: 'solved', moves: [], visited: 1 };

    var visited = new Uint8Array(total);
    var cameFrom = new Int32Array(total);
    var moveFrom = new Int16Array(total); // plate*2 + (0:right,1:left)
    var queue = new Int32Array(total);
    var head = 0, tail = 0;

    visited[startIdx] = 1;
    queue[tail++] = startIdx;
    var found = false;

    while (head < tail && !found) {
      var curIdx = queue[head++];
      var cur = decode(curIdx, n);
      for (var p = 0; p < n && !found; p++) {
        for (var d = 0; d < 2; d++) {
          var next = applyMove(cur, p, d === 0 ? 1 : -1, effect, edge);
          if (next === null) continue;
          var ni = encode(next);
          if (visited[ni]) continue;
          visited[ni] = 1;
          cameFrom[ni] = curIdx;
          moveFrom[ni] = p * 2 + d;
          if (ni === targetIdx) { found = true; break; }
          queue[tail++] = ni;
        }
      }
    }
    if (!visited[targetIdx]) return { status: 'unsolvable', visited: tail };

    var moves = [];
    var cur2 = targetIdx;
    while (cur2 !== startIdx) {
      var mv = moveFrom[cur2];
      moves.push({ plate: (mv / 2) | 0, dir: (mv % 2) === 0 ? 1 : -1 });
      cur2 = cameFrom[cur2];
    }
    moves.reverse();
    return { status: 'solved', moves: moves, visited: tail };
  }

  // ---- minimal integer deque (circular buffer, grows on demand) -------------
  function Deque(cap) {
    this.buf = new Int32Array(cap || 1024);
    this.cap = this.buf.length; this.head = 0; this.tail = 0; this.size = 0;
  }
  Deque.prototype._grow = function () {
    var nb = new Int32Array(this.cap * 2);
    for (var i = 0; i < this.size; i++) nb[i] = this.buf[(this.head + i) % this.cap];
    this.buf = nb; this.cap = nb.length; this.head = 0; this.tail = this.size;
  };
  Deque.prototype.pushBack = function (x) {
    if (this.size === this.cap) this._grow();
    this.buf[this.tail] = x; this.tail = (this.tail + 1) % this.cap; this.size++;
  };
  Deque.prototype.pushFront = function (x) {
    if (this.size === this.cap) this._grow();
    this.head = (this.head - 1 + this.cap) % this.cap; this.buf[this.head] = x; this.size++;
  };
  Deque.prototype.popFront = function () {
    var x = this.buf[this.head]; this.head = (this.head + 1) % this.cap; this.size--; return x;
  };

  // ---- fewest plate switches: 0-1 BFS over (state, last-plate) ---------------
  function solveSwitches(start, effect, edge, target, maxStates) {
    var n = start.length;
    var S = Math.pow(POS, n);
    var P = n + 1;            // last-plate slot: 0..n-1, plus n == "none yet"
    var total = S * P;
    if (total > maxStates) return { status: 'too-large', total: total };

    var startIdx = encode(start);
    var targetIdx = encode(target);
    if (startIdx === targetIdx) return { status: 'solved', moves: [], visited: 1 };

    var INF = 0x7fffffff;
    var dist = new Int32Array(total); for (var z = 0; z < total; z++) dist[z] = INF;
    var done = new Uint8Array(total);
    var cameFrom = new Int32Array(total); for (var z2 = 0; z2 < total; z2++) cameFrom[z2] = -1;
    var moveOf = new Int16Array(total);   // plate*2 + (0:right,1:left)

    var startNode = startIdx * P + n;     // last-plate = none
    dist[startNode] = 0;
    var dq = new Deque(1 << 16);
    dq.pushBack(startNode);

    var pops = 0, goalNode = -1;
    while (dq.size > 0) {
      var u = dq.popFront();
      if (done[u]) continue;
      done[u] = 1; pops++;
      var stateIdx = (u / P) | 0;
      var lastPlate = u - stateIdx * P;
      if (stateIdx === targetIdx) { goalNode = u; break; }
      var cur = decode(stateIdx, n);
      for (var p = 0; p < n; p++) {
        for (var d = 0; d < 2; d++) {
          var next = applyMove(cur, p, d === 0 ? 1 : -1, effect, edge);
          if (next === null) continue;
          var v = encode(next) * P + p;
          var cost = (p === lastPlate) ? 0 : 1;
          var nd = dist[u] + cost;
          if (nd < dist[v]) {
            dist[v] = nd;
            cameFrom[v] = u;
            moveOf[v] = p * 2 + d;
            if (cost === 0) dq.pushFront(v); else dq.pushBack(v);
          }
        }
      }
    }
    if (goalNode < 0) return { status: 'unsolvable', visited: pops };

    var moves = [];
    var node = goalNode;
    while (node !== startNode) {
      var mv = moveOf[node];
      moves.push({ plate: (mv / 2) | 0, dir: (mv % 2) === 0 ? 1 : -1 });
      node = cameFrom[node];
    }
    moves.reverse();
    return { status: 'solved', moves: moves, visited: pops };
  }

  /*
   * Solve a lock.
   *   start  : array of current positions (0..6), length N
   *   effect : N x N coupling matrix
   *   edge   : 'block' (default, real game) | 'wrap' | 'clamp'
   *   opts   : { objective?: 'moves'|'switches', target?, maxStates? }
   * Returns one of:
   *   { status:'solved',     moves:[{plate,dir}], switches, visited }
   *   { status:'unsolvable', visited }
   *   { status:'too-large',  total }
   */
  function solve(start, effect, edge, opts) {
    opts = opts || {};
    edge = edge || 'block';
    var n = start.length;
    var target = opts.target || defaultTarget(n);
    var objective = opts.objective === 'switches' ? 'switches' : 'moves';
    var maxStates = opts.maxStates || (objective === 'switches' ? 8000000 : 6000000);

    var res = objective === 'switches'
      ? solveSwitches(start, effect, edge, target, maxStates)
      : solveMoves(start, effect, edge, target, maxStates);

    if (res.status === 'solved') res.switches = countSwitches(res.moves);
    res.objective = objective;
    return res;
  }

  root.LockSolver = {
    POS: POS,
    TARGET_POS: TARGET_POS,
    encode: encode,
    decode: decode,
    defaultTarget: defaultTarget,
    isSolved: isSolved,
    countSwitches: countSwitches,
    applyMove: applyMove,
    solve: solve
  };
})(typeof window !== 'undefined' ? window : this);
