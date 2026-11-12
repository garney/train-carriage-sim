import { Router } from "express";
import { z } from "zod";
import type { SimulationState, TimelineMode, TrainLine } from "../shared/types.js";
import { requireAuth, type AuthedRequest } from "./auth.js";
import { advanceSimulation, createSimulation, presentSimulation } from "./simulation.js";
import { supabaseAdmin } from "./supabase.js";

const settingsSchema = z.object({ line: z.enum(["T1", "T4", "T9"]), speed: z.number().min(0.25).max(8) });

type TimelineRow = { id: string; owner_id: string | null; scope: TimelineMode; line: TrainLine; speed: number; state: SimulationState };

async function getTimeline(mode: TimelineMode, userId?: string): Promise<TimelineRow> {
  let query = supabaseAdmin.from("simulation_timelines").select("id, owner_id, scope, line, speed, state").eq("scope", mode);
  query = mode === "personal" ? query.eq("owner_id", userId ?? "") : query.is("owner_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as TimelineRow;
  const line: TrainLine = mode === "shared" ? "T1" : "T4";
  const { data: created, error: createError } = await supabaseAdmin
    .from("simulation_timelines")
    .insert({ owner_id: mode === "personal" ? userId : null, scope: mode, line, speed: 1, state: createSimulation(line, mode, userId) })
    .select("id, owner_id, scope, line, speed, state")
    .single();
  if (createError || !created) throw new Error(createError?.message ?? "Could not create timeline");
  return created as TimelineRow;
}

async function currentSnapshot(mode: TimelineMode, userId?: string) {
  const row = await getTimeline(mode, userId);
  const state = advanceSimulation(row.state, row.speed);
  const { error } = await supabaseAdmin
    .from("simulation_timelines")
    .update({ state, last_ticked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  return presentSimulation(state, row.speed);
}

export function createApiRouter() {
  const router = Router();
  router.get("/health", (_req, res) => res.json({ ok: true, app: "carriage-watch", simulation: "server-owned" }));
  router.get("/me", requireAuth, (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json({ id: user.id, displayName: user.displayName, email: user.email, avatarUrl: user.avatarUrl, isAdmin: user.isAdmin });
  });
  router.get("/simulation/shared", requireAuth, async (_req, res) => {
    try { res.json(await currentSnapshot("shared")); } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "Could not load shared timeline" }); }
  });
  router.get("/simulation/personal", requireAuth, async (req, res) => {
    try { res.json(await currentSnapshot("personal", (req as AuthedRequest).user.id)); } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "Could not load personal timeline" }); }
  });
  router.post("/simulation/personal/settings", requireAuth, async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    try {
      const userId = (req as AuthedRequest).user.id;
      const row = await getTimeline("personal", userId);
      const state = row.line === parsed.data.line ? row.state : createSimulation(parsed.data.line, "personal", userId);
      const { error } = await supabaseAdmin.from("simulation_timelines")
        .update({ line: parsed.data.line, speed: parsed.data.speed, state, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw new Error(error.message);
      res.json(presentSimulation(state, parsed.data.speed));
    } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "Could not update personal timeline" }); }
  });
  return router;
}
