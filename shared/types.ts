export type Profile = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

export type Note = {
  id: string;
  body: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
};

export type TrainLine = "T1" | "T4" | "T9";
export type TimelineMode = "shared" | "personal";

export type Passenger = {
  id: string;
  type: "commuter" | "student";
  status: "seated" | "standing" | "boarding" | "alighting";
  destination: string;
  deck: 0 | 1;
  row: number;
  side: "two" | "three" | "aisle";
  seat: number;
  x: number;
  y: number;
  speed: number;
  frustration: number;
};

export type SimulationState = {
  version: number;
  mode: TimelineMode;
  line: TrainLine;
  seed: number;
  simulatedMinutes: number;
  stopIndex: number;
  dwellSeconds: number;
  lastTickMs: number;
  lastBoardMs: number;
  passengers: Passenger[];
  seatDirections: Array<"forward" | "back">;
};

export type SimulationSnapshot = SimulationState & {
  clock: string;
  currentStop: string;
  nextStop: string;
  route: string[];
  speed: number;
  seated: number;
  standing: number;
  capacity: number;
};
