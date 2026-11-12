import type { Profile, SimulationSnapshot, TrainLine } from "../../shared/types";
import { supabase } from "./supabase";

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => apiFetch<Profile>("/me"),
  sharedSimulation: () => apiFetch<SimulationSnapshot>("/simulation/shared"),
  personalSimulation: () => apiFetch<SimulationSnapshot>("/simulation/personal"),
  updatePersonalSimulation: (line: TrainLine, speed: number) =>
    apiFetch<SimulationSnapshot>("/simulation/personal/settings", {
      method: "POST",
      body: JSON.stringify({ line, speed })
    })
};
