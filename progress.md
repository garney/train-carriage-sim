Original prompt: Build an observer-focused simulation of one Sydney-style double-deck train carriage, shown from above, with people boarding, sitting or standing, seat direction, and school groups.

Implemented: A dependency-free canvas prototype with upper/lower deck visualizations, reversible-seat arrows, adults/students/standing passengers, continuous arrivals, route clock, pause, rush-hour injection, group-rate and direction controls. It includes selectable T1, T4, and T9 route context and a station progress strip. Simulation state is exposed through `render_game_to_text` and deterministic stepping through `advanceTime`.

Runtime: Converted to a Node project. Use `npm start` for the local server or `npm run dev` for watch mode; no third-party packages are required.

Verification: Visually opened locally in a browser. Fixed seat occupancy bookkeeping so filled seats render and capacity statistics track occupied seats correctly.

Latest change: Rebuilt every transverse seating row as an asymmetric 2+3 configuration, including the short vestibule bays. Individual seats retain independent reversible facing direction.

Latest behaviour: Passengers receive a destination when boarding. At each simulated station, those whose trip ends there vacate their seat and visibly walk out through the nearest end door before new passengers board.

Latest behaviour: T1, T4, and T9 each own a persistent, independently seeded carriage instance. Switching the line changes the observed carriage, including its passenger mix, occupancy, clock, station position, and future simulation state.

Latest UI: A prominent journey panel names both the current station and the next stop, with matching current/next highlights in the route strip.

Latest behaviour: Student boarding now follows simulated time. Morning groups share an upcoming school destination and their group destination is shown as an explicit Student Flow / GET OFF panel; the school-day window is low volume and the afternoon creates homebound school traffic.

Latest behaviour: Removed the user-facing seat-direction control. Each passenger now chooses their facing direction and turns their own reversible seat while settling; most face the travel direction, school groups usually align, and a small rebellious share faces away.

Latest behaviour: Removed the school-group control. Student demand is now entirely simulated from time of day, the selected line, and the active school destination.

Latest layout: Reoriented the canvas into a left/right dual-deck view. Each deck is now a tall front-to-rear carriage with a long central aisle, rather than a wide horizontal strip.

Latest layout: Shifted the aisle toward the 2-seat side and tightened that bank, removing the large dead area previously visible beside it while retaining a wider 3-seat side.

Latest movement: Passenger paths now follow the central aisle then turn into their row, with individual speeds, aisle queues, yielding standing passengers, and occasional impatient squeezing. Reversible direction is now bank-level: turning one 2- or 3-seat bank flips the full row on that side.

Latest UI: Updated the legend so the white dash on orange passenger markers is clearly explained as a student / school-group indicator.

Latest seating: Standing now occurs only once no free seats remain. Seat choice follows bank etiquette: empty two-banks first, then empty three-bank windows, aisle seats next, and three-bank middle seats last. A window passenger alighting makes adjacent passengers temporarily step out and reselect a seat.

Latest seating: Standing riders reassess the newly available seats each time passengers alight, rather than staying standing once capacity has opened up.

Latest social behaviour: Morning students can now board as 2–4 person groups, prioritising the same seat bank and then the same row. A passenger entering a window seat makes current aisle/middle occupants step out and reselect before the window seat is taken.

Runtime verification: Node server defaults to port `3000` (an explicit `PORT` environment variable can still override it).

TODO: Add station-by-station alighting, better social group seating choices, individual carriage front/rear composition, and expanded multiple-carriage train layout.

Full-stack migration: Replaced the static-server entry point with the user's `@garney/garney-stack` scaffold (Express, Vite/React, Supabase Auth, PostgreSQL migrations). Added `simulation_timelines` persistence and server-side progression. Every client frame is a fetched server snapshot; there are two protected modes: one shared service and one personal account-owned timeline. Personal timelines can select T1/T4/T9 and speeds from 0.25× to 8×; shared mode is deliberately read-only.

TODO: Start the local Docker stack, apply migrations, then exercise authenticated shared/personal timeline persistence across a browser refresh. The new React canvas provides `render_game_to_text`; visual verification remains required once dependencies are installed.

Verification: `npm install`, `npm run typecheck`, and `npm run build` now pass. `npm run stack` starts local PostgreSQL/Supabase Auth and successfully applies migration `0003_simulation_timelines.sql`. `/api/health` returns the server-owned marker and `/api/simulation/shared` correctly returns 401 without a bearer token. The Playwright game client captured and the visual review confirmed the auth screen. Remaining manual check: sign up / sign in and confirm personal timeline state survives a refresh (not performed because it would create a local test account).

Latest repair: Restored the detailed tall double-deck canvas language from the prototype (rounded carriage shells, doors, stairs, narrow 2-seat bank, wide 3-seat bank, bank-facing arrows, and passenger colour legend). Passenger state is now server-persisted with normalized x/y coordinates and `boarding`, `seated`, `standing`, and `alighting` phases. The server advances walkers along the aisle and into their assigned bank; clients poll snapshots at 450ms and only render. `npm run typecheck` and `npm run build` pass after this change.

Latest movement repair: The server now creates a small 1–2 rider boarding stream every 2.6 seconds between station exchanges, so an observer is not left watching a settled, static carriage. Client snapshot/render cadence is 180ms. `npm run typecheck` passes; a direct deterministic server test confirms passenger count rises and riders retain `boarding` positions in the aisle.
