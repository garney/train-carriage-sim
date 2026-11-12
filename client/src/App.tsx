import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Profile, SimulationSnapshot, TrainLine } from "../../shared/types";
import { api } from "./api";
import { supabase } from "./supabase";

type SessionState = "loading" | "signed-out" | "signed-in";
type ViewMode = "shared" | "personal";

function drawCarriage(canvas: HTMLCanvasElement, state: SimulationSnapshot) {
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  const dpr = devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr); canvas.height = Math.floor(Math.max(650, rect.width * 0.84) * dpr);
  const W = canvas.width / dpr, H = canvas.height / dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#c7dddf"; ctx.fillRect(0, 0, W, H);
  const pad = Math.max(18, W * 0.035), gap = Math.max(22, W * 0.035), deckW = (W - pad * 2 - gap) / 2, deckH = H - pad * 2;
  for (const deck of [0, 1] as const) {
    const x = pad + deck * (deckW + gap), y = pad, aisle = x + deckW * 0.48;
    ctx.beginPath(); ctx.roundRect(x, y, deckW, deckH, 36); ctx.fillStyle = "#fbfcf8"; ctx.fill(); ctx.strokeStyle = "#789599"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#e2ece8"; ctx.fillRect(aisle - deckW * 0.06, y + deckH * 0.055, deckW * 0.12, deckH * 0.89);
    ctx.fillStyle = "#718b90"; ctx.font = "700 11px system-ui"; ctx.fillText(deck === 0 ? "UPPER DECK" : "LOWER DECK", x + 16, y + 20);
    ctx.fillStyle = "#94a8a4"; ctx.font = "10px system-ui"; ctx.fillText(deck === 0 ? "upper level · doors at both ends" : "lower level · aisle queue", x + 16, y + 34);
    ctx.fillStyle = "#80999b"; ctx.font = "700 9px system-ui"; ctx.fillText("↑ FRONT", aisle - 18, y + 17); ctx.fillText("REAR ↓", aisle - 18, y + deckH - 10);
    ctx.fillStyle = "#b6d1d8"; ctx.fillRect(aisle - deckW * 0.05, y - 3, deckW * 0.1, 8); ctx.fillRect(aisle - deckW * 0.05, y + deckH - 5, deckW * 0.1, 8);
    const map = (px: number, py: number) => [x + px * deckW, y + py * deckH] as const;
    for (let row = 0; row < 10; row += 1) for (const side of ["two", "three"] as const) {
      const positions = side === "two" ? [0.20, 0.29] : [0.61, 0.70, 0.79]; const direction = state.seatDirections[deck * 10 + row] ?? "forward";
      positions.forEach((px) => { const [sx, sy] = map(px, 0.14 + row * 0.082), sw = deckW * 0.048, sh = deckH * 0.04; ctx.beginPath(); ctx.roundRect(sx - sw / 2, sy - sh / 2, sw, sh, 3); ctx.fillStyle = "#fdfdfb"; ctx.fill(); ctx.strokeStyle = "#55767b"; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = direction === "forward" ? "#9bb2b2" : "#d1a684"; ctx.fillRect(sx - sw * 0.28, sy - sh * 0.28, sw * 0.56, sh * 0.12); ctx.fillStyle = "#6c8588"; ctx.font = "8px sans-serif"; ctx.fillText(direction === "forward" ? "↑" : "↓", sx - 2.5, sy + sh * 0.26); });
    }
    state.passengers.filter((p) => p.deck === deck).forEach((p) => { const [px, py] = map(p.x, p.y), r = Math.min(deckW, deckH) * 0.021; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = p.status === "alighting" ? "#c85e45" : p.status === "standing" ? "#e7b84e" : p.type === "student" ? "#f47f4c" : "#1e7391"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke(); if (p.type === "student") { ctx.fillStyle = "#fff"; ctx.fillRect(px - r * .55, py - r * .25, r * 1.1, r * .22); } });
    ctx.strokeStyle = "#80999b"; for (let i = 0; i < 5; i += 1) { ctx.beginPath(); ctx.moveTo(aisle - deckW * .07, y + deckH * (.42 + i * .025)); ctx.lineTo(aisle - deckW * .1, y + deckH * (.435 + i * .025)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(aisle + deckW * .07, y + deckH * (.42 + i * .025)); ctx.lineTo(aisle + deckW * .1, y + deckH * (.435 + i * .025)); ctx.stroke(); }
  }
}

function CarriageCanvas({ state }: { state: SimulationSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const render = () => { if (ref.current) drawCarriage(ref.current, state); }; render(); window.addEventListener("resize", render); return () => window.removeEventListener("resize", render); }, [state]);
  useEffect(() => { window.render_game_to_text = () => JSON.stringify({ coordinateSystem: "each deck normalized x left-to-right, y front-to-back", line: state.line, time: state.clock, station: state.currentStop, nextStop: state.nextStop, seated: state.seated, standing: state.standing, boarding: state.passengers.filter((p) => p.status === "boarding").length, alighting: state.passengers.filter((p) => p.status === "alighting").length }); window.advanceTime = () => undefined; }, [state]);
  return <canvas ref={ref} className="carriage-canvas" aria-label="Animated bird's-eye view of upper and lower train decks" />;
}

export function App() {
  const [sessionState, setSessionState] = useState<SessionState>("loading"), [profile, setProfile] = useState<Profile | null>(null), [mode, setMode] = useState<ViewMode>("shared"), [sim, setSim] = useState<SimulationSnapshot | null>(null), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const { data } = supabase.auth.onAuthStateChange(async (_event, session) => { if (!session) { setProfile(null); setSim(null); setSessionState("signed-out"); return; } try { setProfile(await api.me()); setSessionState("signed-in"); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load profile"); setSessionState("signed-out"); } }); void supabase.auth.getSession(); return () => data.subscription.unsubscribe(); }, []);
  useEffect(() => { if (sessionState !== "signed-in") return; let cancelled = false; const refresh = async () => { try { const next = await (mode === "shared" ? api.sharedSimulation() : api.personalSimulation()); if (!cancelled) setSim(next); } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "Timeline unavailable"); } }; void refresh(); const timer = window.setInterval(refresh, 180); return () => { cancelled = true; window.clearInterval(timer); }; }, [sessionState, mode]);
  async function withBusy(action: () => Promise<void>) { setBusy(true); setMessage(""); try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong"); } finally { setBusy(false); } }
  function signIn(event: FormEvent) { event.preventDefault(); void withBusy(async () => { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; }); }
  function signUp() { void withBusy(async () => { const { error } = await supabase.auth.signUp({ email, password }); if (error) throw error; setMessage("Account created — local email confirmation is enabled."); }); }
  function updatePersonal(line: TrainLine, speed: number) { void withBusy(async () => setSim(await api.updatePersonalSimulation(line, speed))); }
  if (sessionState === "loading") return <div className="center-screen">Loading Carriage Watch…</div>;
  if (sessionState === "signed-out") return <div className="auth-screen"><div className="auth-panel"><span className="eyebrow">SYDNEY RAIL OBSERVER</span><h1>Carriage Watch</h1><p>Sign in to observe the shared service or run a private timeline at your own pace.</p><form className="stack" onSubmit={signIn}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><div className="row"><button disabled={busy}>Sign in</button><button type="button" className="secondary" disabled={busy} onClick={signUp}>Create account</button></div></form>{message && <p className="message">{message}</p>}</div></div>;
  return <main className="observer"><header className="topbar"><div><span className="eyebrow">SERVER-OWNED SIMULATION</span><h1>Carriage Watch</h1><p>{profile?.displayName} · authenticated observer</p></div><button className="secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button></header><section className="mode-switch"><button className={mode === "shared" ? "active" : ""} onClick={() => setMode("shared")}>Shared service<span>Everyone observes the same train</span></button><button className={mode === "personal" ? "active" : ""} onClick={() => setMode("personal")}>My timeline<span>Your line, pace and saved state</span></button></section>{message && <p className="message">{message}</p>}{sim ? <><section className="journey"><div><span>NOW AT</span><strong>{sim.currentStop}</strong></div><div className="arrow">→</div><div><span>NEXT STOP</span><strong>{sim.nextStop}</strong></div><div className="clock">{sim.clock}<small>{sim.line} · {sim.speed}×</small></div></section>{mode === "personal" && <section className="controls"><label>Line<select value={sim.line} onChange={(event) => updatePersonal(event.target.value as TrainLine, sim.speed)}>{(["T1", "T4", "T9"] as TrainLine[]).map((line) => <option key={line}>{line}</option>)}</select></label><label>Timeline speed<select value={sim.speed} onChange={(event) => updatePersonal(sim.line, Number(event.target.value))}>{[.25, .5, 1, 2, 4, 8].map((speed) => <option value={speed} key={speed}>{speed}×</option>)}</select></label><p>Only your personal timeline can be adjusted. It is persisted against your account.</p></section>}<section className="stats"><span><b>{sim.seated}</b> seated</span><span><b>{sim.standing}</b> standing</span><span><b>{sim.capacity}</b> seats</span><span className="student-key">orange — school group · yellow — standing · red — alighting</span></section><CarriageCanvas state={sim} /></> : <div className="loading-panel">Loading the authoritative carriage state…</div>}</main>;
}
declare global { interface Window { render_game_to_text?: () => string; advanceTime?: (ms: number) => void; } }
