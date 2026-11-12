import type { SimulationState, TimelineMode, TrainLine } from "../shared/types.js";

const ROUTES: Record<TrainLine, string[]> = {
  T1: ["Penrith", "Parramatta", "Strathfield", "Redfern", "Central", "Town Hall", "Wynyard", "North Sydney", "Chatswood", "Hornsby"],
  T4: ["Cronulla", "Sutherland", "Hurstville", "Redfern", "Central", "Town Hall", "Bondi Junction"],
  T9: ["Hornsby", "Epping", "Rhodes", "Strathfield", "Redfern", "Central", "Town Hall", "Gordon"]
};

const SCHOOL_STOPS: Record<TrainLine, string[]> = {
  T1: ["Parramatta", "Strathfield", "Hornsby"],
  T4: ["Hurstville", "Central", "Bondi Junction"],
  T9: ["Epping", "Strathfield", "Gordon"]
};

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}

function nextRandom(state: SimulationState) {
  let x = state.seed || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.seed = x >>> 0;
  return (state.seed % 10000) / 10000;
}

function timeLabel(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, "0")}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;
}

export function createSimulation(line: TrainLine, mode: TimelineMode, ownerKey = "shared"): SimulationState {
  const stops = ROUTES[line];
  const state: SimulationState = {
    version: 1,
    mode,
    line,
    seed: hash(`${ownerKey}:${line}`),
    simulatedMinutes: mode === "shared" ? 7 * 60 + 18 : 7 * 60 + 6,
    stopIndex: 0,
    dwellSeconds: 6,
    lastTickMs: Date.now(),
    lastBoardMs: Date.now(),
    passengers: [],
    seatDirections: Array.from({ length: 20 }, (_, row) => (row % 3 === 0 ? "back" : "forward"))
  };
  for (let i = 0; i < 20; i += 1) boardPassenger(state, i < 12 ? "commuter" : "student");
  return state;
}

function freeSeats(state: SimulationState) {
  const occupied = new Set(state.passengers.filter((p) => p.status !== "alighting" && p.side !== "aisle").map((p) => `${p.deck}-${p.row}-${p.side}-${p.seat}`));
  const seats: Array<{ deck: 0 | 1; row: number; side: "two" | "three"; seat: number }> = [];
  for (const deck of [0, 1] as const) {
    for (let row = 0; row < 10; row += 1) {
      for (const side of ["two", "three"] as const) {
        const capacity = side === "two" ? 2 : 3;
        for (let seat = 0; seat < capacity; seat += 1) {
          const key = `${deck}-${row}-${side}-${seat}`;
          if (!occupied.has(key)) seats.push({ deck, row, side, seat });
        }
      }
    }
  }
  return seats;
}

function boardPassenger(state: SimulationState, type: "commuter" | "student") {
  const seats = freeSeats(state);
  const id = `${state.line}-${state.simulatedMinutes}-${state.passengers.length}-${Math.floor(nextRandom(state) * 9999)}`;
  const route = ROUTES[state.line];
  const destination = type === "student"
    ? SCHOOL_STOPS[state.line][Math.floor(nextRandom(state) * SCHOOL_STOPS[state.line].length)]
    : route[Math.min(route.length - 1, state.stopIndex + 2 + Math.floor(nextRandom(state) * 5))];
  if (!seats.length) {
    const row = Math.floor(nextRandom(state) * 10);
    state.passengers.push({ id, type, status: "standing", destination, deck: nextRandom(state) > 0.5 ? 1 : 0, row, side: "aisle", seat: 0, x: 0.5, y: 0.12 + row * 0.082, speed: 0.18 + nextRandom(state) * 0.15, frustration: 0 });
    return;
  }
  // Singles favour a vacant 2-bank, then window seats in a 3-bank.
  seats.sort((a, b) => {
    const score = (s: (typeof seats)[number]) => (s.side === "two" ? 0 : s.seat === 0 ? 1 : s.seat === 2 ? 2 : 4) + nextRandom(state) * 0.05;
    return score(a) - score(b);
  });
  const choice = seats[0];
  state.passengers.push({ id, type, status: "boarding", destination, ...choice, x: 0.5, y: 1.06, speed: 0.16 + nextRandom(state) * 0.18, frustration: 0 });
}

function seatPosition(passenger: SimulationState["passengers"][number]) {
  const x = passenger.side === "two" ? [0.20, 0.29][passenger.seat] : [0.61, 0.70, 0.79][passenger.seat];
  return { x: x ?? 0.5, y: 0.14 + passenger.row * 0.082 };
}

function movePassengers(state: SimulationState, elapsedSeconds: number) {
  state.passengers.forEach((passenger) => {
    if (passenger.status === "seated") return;
    const target = passenger.status === "alighting" ? { x: 0.5, y: -0.07 } : passenger.status === "standing" ? { x: 0.5, y: 0.14 + passenger.row * 0.082 } : seatPosition(passenger);
    const aisleTarget = passenger.status === "boarding" && Math.abs(passenger.y - target.y) > 0.02 ? { x: 0.5, y: target.y } : target;
    const dx = aisleTarget.x - passenger.x, dy = aisleTarget.y - passenger.y, distance = Math.hypot(dx, dy);
    const pace = passenger.speed * elapsedSeconds;
    if (distance <= pace || distance < 0.008) { passenger.x = aisleTarget.x; passenger.y = aisleTarget.y; }
    else { passenger.x += dx / distance * pace; passenger.y += dy / distance * pace; }
    if (passenger.status === "boarding" && Math.hypot(target.x - passenger.x, target.y - passenger.y) < 0.012) passenger.status = "seated";
  });
  state.passengers = state.passengers.filter((passenger) => passenger.status !== "alighting" || passenger.y > -0.04);
}

function stationExchange(state: SimulationState) {
  const stop = ROUTES[state.line][state.stopIndex];
  state.passengers.forEach((p) => { if (p.destination === stop && nextRandom(state) <= 0.72) { p.status = "alighting"; p.x = 0.5; } });
  const morning = state.simulatedMinutes >= 6 * 60 && state.simulatedMinutes <= 9 * 60;
  const schoolStop = SCHOOL_STOPS[state.line].includes(stop);
  const boarding = 2 + Math.floor(nextRandom(state) * 5) + (schoolStop && morning ? 5 : 0);
  for (let i = 0; i < boarding; i += 1) boardPassenger(state, schoolStop && morning && nextRandom(state) < 0.55 ? "student" : "commuter");
  // A few banks naturally get flipped by riders as a service progresses.
  if (nextRandom(state) < 0.28) {
    const bank = Math.floor(nextRandom(state) * state.seatDirections.length);
    state.seatDirections[bank] = state.seatDirections[bank] === "forward" ? "back" : "forward";
  }
}

export function advanceSimulation(state: SimulationState, speed: number, now = Date.now()) {
  // Timelines written by the first full-stack version are upgraded in place.
  state.passengers.forEach((passenger) => {
    if (!Number.isFinite(passenger.x) || !Number.isFinite(passenger.y)) {
      const target = passenger.side === "aisle" ? { x: 0.5, y: 0.14 + passenger.row * 0.082 } : seatPosition(passenger);
      passenger.x = target.x; passenger.y = target.y;
      passenger.speed = passenger.speed || 0.22; passenger.frustration = passenger.frustration || 0;
      if (passenger.status === "boarding" || passenger.status === "alighting") passenger.status = passenger.side === "aisle" ? "standing" : "seated";
    }
  });
  if (!Number.isFinite(state.lastBoardMs)) state.lastBoardMs = now;
  const elapsedSeconds = Math.max(0, Math.min(15, (now - state.lastTickMs) / 1000));
  state.lastTickMs = now;
  state.simulatedMinutes += elapsedSeconds * speed;
  movePassengers(state, elapsedSeconds * speed);
  // Keep a small, observable stream moving between station exchanges. This is
  // server-owned state, rather than a decorative client-side animation.
  if (now - state.lastBoardMs >= 2600) {
    const morning = state.simulatedMinutes >= 6 * 60 && state.simulatedMinutes <= 9 * 60;
    const schoolService = SCHOOL_STOPS[state.line].includes(ROUTES[state.line][state.stopIndex]);
    const count = 1 + (nextRandom(state) > 0.72 ? 1 : 0);
    for (let i = 0; i < count; i += 1) boardPassenger(state, morning && schoolService && nextRandom(state) < 0.55 ? "student" : "commuter");
    state.lastBoardMs = now;
  }
  while (state.simulatedMinutes >= 24 * 60) state.simulatedMinutes -= 24 * 60;

  if (state.dwellSeconds > 0) {
    state.dwellSeconds -= elapsedSeconds * speed;
    if (state.dwellSeconds <= 0) state.dwellSeconds = 0;
  } else if (Math.floor(state.simulatedMinutes) % 5 === 0) {
    state.stopIndex = (state.stopIndex + 1) % ROUTES[state.line].length;
    stationExchange(state);
    state.dwellSeconds = 7;
  }
  return state;
}

export function presentSimulation(state: SimulationState, speed: number) {
  const stops = ROUTES[state.line];
  const seated = state.passengers.filter((p) => p.status === "seated").length;
  const standing = state.passengers.filter((p) => p.status === "standing").length;
  return {
    ...state,
    clock: timeLabel(state.simulatedMinutes),
    currentStop: stops[state.stopIndex],
    nextStop: stops[(state.stopIndex + 1) % stops.length],
    route: stops,
    speed,
    seated,
    standing,
    capacity: 100
  };
}
