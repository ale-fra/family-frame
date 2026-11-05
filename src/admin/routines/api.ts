// Admin client for the routines API (/api/admin/routines), authenticated with the admin PIN.
import type { components } from "@/lib/api-schema";
import { request } from "../api";
import type { Routine, RoutinePayload } from "./routineFormat";

export type Occurrence = components["schemas"]["Occurrence"];

const base = "/api/admin/routines";
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body)
});

async function routineCall(pin: string, url: string, init: RequestInit): Promise<Routine> {
  const response = await request(url, init, pin);
  return ((await response.json()) as { routine: Routine }).routine;
}

export async function listRoutines(pin: string, includeCancelled: boolean): Promise<Routine[]> {
  const response = await request(`${base}?includeCancelled=${includeCancelled}`, { cache: "no-store" }, pin);
  return ((await response.json()) as { routines: Routine[] }).routines;
}

export const createRoutine = (pin: string, payload: RoutinePayload) => routineCall(pin, base, json("POST", payload));
export const updateRoutine = (pin: string, id: string, patch: Partial<RoutinePayload>) =>
  routineCall(pin, `${base}/${id}`, json("PATCH", patch));
/** resumeOn: "YYYY-MM-DD", or "" to pause until resumed. */
export const pauseRoutine = (pin: string, id: string, resumeOn: string) =>
  routineCall(pin, `${base}/${id}/pause`, json("POST", resumeOn ? { resumeOn } : {}));
export const resumeRoutine = (pin: string, id: string) => routineCall(pin, `${base}/${id}/resume`, { method: "POST" });
export const cancelRoutine = (pin: string, id: string) => routineCall(pin, `${base}/${id}/cancel`, { method: "POST" });
export const skipOccurrence = (pin: string, id: string, date: string) =>
  routineCall(pin, `${base}/${id}/exceptions/${date}`, json("PUT", { kind: "skipped" }));
export const restoreOccurrence = (pin: string, id: string, date: string) =>
  routineCall(pin, `${base}/${id}/exceptions/${date}`, { method: "DELETE" });

export async function listOccurrences(pin: string, from: string, to: string): Promise<Occurrence[]> {
  const query = new URLSearchParams({ from, to });
  const response = await request(`${base}/occurrences?${query}`, { cache: "no-store" }, pin);
  return ((await response.json()) as { occurrences: Occurrence[] }).occurrences;
}
