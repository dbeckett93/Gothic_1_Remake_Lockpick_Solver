# Gothic 1 Remake — Lockpick Solver

A tiny, dependency-free web app that solves the **sliding‑plate lock minigame** in the
*Gothic 1 Remake*. Tell it how your lock is wired and where the plates sit, and it finds the
shortest sequence of moves that lines every plate up on the centre pin.

No build step, no server, no tracking — it's one HTML file plus one script. Open
[`index.html`](index.html) in any browser and go.

---

## The minigame, in one paragraph

A lock is a stack of **4–7 horizontal plates**. Each plate has **7 holes** and one pin; you
select a plate and slide it **left / right** one notch at a time. The lock opens when **every
pin sits in the centre hole (pin 4) at once**. The catch: plates are **wired together** — moving
one plate also nudges one or more others by one notch, sometimes in the **opposite** direction.
The wiring is **hidden** and **different for every lock**, and a pin **can't leave the row**: any
push (including the knock‑on movement of a linked plate) that would shove a pin off either edge is
**refused** (and in‑game strains/breaks your pick). You discover the wiring by tapping one plate
and watching what moves.

This tool models exactly that and searches for an optimal solution.

## How to use it

1. **Lock setup** — pick the number of plates.
2. **Current positions** — click a slot on each plate to mark where its pin sits right now. The
   green‑tinted column is the target (pin 4). Use the **◀ ▶** buttons to test a real move with
   couplings applied — handy for sanity‑checking your wiring against the game. The **Plate order**
   toggle flips the stack (P1 at top ↔ P1 at bottom) so it matches what you see in‑game; it's a
   display choice only and the solution's plate numbers follow it.
3. **Couplings** — the grid starts **empty**; fill in only the links your lock actually has. Each
   **row** is one plate you push **one notch right**. Click a cell to cycle:
   - **→** the linked plate moves the **same** way you pushed,
   - **←** it moves the **opposite** way (inverted),
   - **·** no effect.
   The shaded **•** on the diagonal is the plate itself — it always moves when you push it, so you
   never set it. Pushing a plate **left** simply mirrors its row. A worked example sits beside the
   grid to show the idea.
4. **Solve** — get the ordered step list. Press **▶ Play** to watch the lock open one move at a
   time, or **Copy steps** to take the list with you.

Your setup is saved in the browser, so a refresh won't lose it.

### Discovering the wiring in‑game

From a settled lock, nudge **one** plate a single notch and watch which other plates move and in
which direction; that fills one row of the grid. Repeat for each plate. (Higher lockpicking skill
in‑game can *remove* a connection, which just means a cell becomes **·**.)

## How it works

The lock is a state vector (one position per plate). Each move applies a fixed `±1` effect to the
pushed plate and its linked plates. The solver runs a **breadth‑first search over the bounded state
space** (`7^N ≤ 823,543` for `N ≤ 7`), which returns a provably **shortest** solution and — unlike
solving it as linear algebra — stays correct under the "walls" rule, where a blocked move simply
isn't a legal edge.

Everything lives in [`solver.js`](solver.js) (pure logic, no DOM) and [`index.html`](index.html)
(the UI).

## Running and deploying

- **Run locally:** just open `index.html` in a browser. That's it.
- **Host it:** it's fully static, so GitHub Pages works out of the box — enable Pages on this repo
  (Settings → Pages → deploy from the `main` branch) and it's live.

## Tests

Open [`tests.html`](tests.html) in a browser to run the solver's self‑tests (correctness of the
atomic "walls" rule, optimality of the search versus a reference, ~900 randomised end‑to‑end
trials, and an `N=7` performance check). A green `RESULT: PASS …` line at the top means all good.

## Notes & limitations

- The solver is only as right as the **couplings and positions you enter** — one wrong cell yields
  a confident but wrong sequence. Use the **◀ ▶** buttons to verify the wiring before trusting a
  solution.
- **Order matters.** Because of the walls, the steps are path‑dependent — follow them in order.
- Made a mistake mid‑solve? Re‑click the slots to enter the lock's new positions and solve again.
- `P1` is just a label, not a fixed physical plate — map each real plate to a row however is
  easiest and stay consistent across positions, couplings, and the solution. Some guides number
  plates bottom‑to‑top; use the **Plate order** toggle to put `P1` at the top or bottom so the
  on‑screen stack matches your view.

## Prior art & sources

This is a small, self‑contained take on a well‑explored puzzle. The mechanic and the
coupling‑matrix approach are corroborated by several community guides and open‑source solvers,
including write‑ups on Mobalytics, GameRant and PC Gamer, and tools such as
[Razikus/gothic-remake-chestlock-solver](https://github.com/Razikus/gothic-remake-chestlock-solver),
[Xetoxyc/gothic-remake-lockpicker](https://github.com/Xetoxyc/gothic-remake-lockpicker), and
[kamilcieslik/gothic-remake-lockbreaker](https://github.com/kamilcieslik/gothic-remake-lockbreaker).
