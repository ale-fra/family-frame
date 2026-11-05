import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../src/admin/api";
import * as api from "../../src/admin/routines/api";
import { RoutinesSection } from "../../src/admin/routines/RoutinesSection";
import type { Routine } from "../../src/admin/routines/routineFormat";

vi.mock("../../src/admin/routines/api");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Monday 15 September 2025, 07:00 in Rome.
const NOW = Date.parse("2025-09-15T05:00:00Z");
const PIN = "482913";
const ROME = { locale: "it-IT", timeZone: "Europe/Rome" };

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r1", title: "Accompagnare i bimbi a scuola", time: "08:10",
    recurrence: { frequency: "weekly", interval: 1, weekdays: ["mon", "tue", "wed", "thu", "fri"] },
    startDate: "2025-09-01", endDate: null, noticeMinutes: 15, autoDismissMs: 60_000, style: "clock", icon: "backpack",
    status: "active", resumeOn: null, cancelledAt: null, createdAt: "2025-09-01T00:00:00.000Z", updatedAt: "2025-09-01T00:00:00.000Z",
    timeZone: "Europe/Rome", exceptions: [],
    nextOccurrence: { date: "2025-09-16", at: "2025-09-16T06:10:00.000Z", dismissed: false },
    ...overrides
  } as Routine;
}

const occurrence = (date: string, routineId = "r1") => ({
  routineId, title: "x", date, at: `${date}T06:10:00.000Z`, showFrom: `${date}T05:55:00.000Z`, dismissAt: `${date}T06:11:00.000Z`,
  noticeMinutes: 15, style: "clock" as const, icon: "backpack", dismissed: false
});

describe("RoutinesSection", () => {
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.mocked(api.listRoutines).mockResolvedValue([routine()]);
    vi.mocked(api.listOccurrences).mockResolvedValue([occurrence("2025-09-16"), occurrence("2025-09-17")]);
    for (const name of ["createRoutine", "updateRoutine", "pauseRoutine", "resumeRoutine", "cancelRoutine", "skipOccurrence", "restoreOccurrence"] as const) {
      vi.mocked(api[name]).mockResolvedValue(routine());
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const show = (i18n: { locale: string; language?: string; timeZone?: string } = ROME) =>
    render(<RoutinesSection pin={PIN} i18n={i18n} onUnauthorized={onUnauthorized} />);
  const card = async (title = "Accompagnare i bimbi a scuola") => (await screen.findByText(title)).closest("article") as HTMLElement;

  it("invites to create the first routine when there is none", async () => {
    vi.mocked(api.listRoutines).mockResolvedValue([]);
    show();
    expect(await screen.findByText("Nessuna routine")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Nuova routine/ }).length).toBeGreaterThan(0);
  });

  it("lists routines in plain words, with their status and next time", async () => {
    show();
    const item = await card();
    expect(within(item).getByText("Dal lunedì al venerdì alle 08:10 · avviso 15 min prima")).toBeTruthy();
    expect(within(item).getByText("Attiva")).toBeTruthy();
    expect(within(item).getByText("Prossima: domani alle 08:10")).toBeTruthy();
  });

  it("creates a routine with friendly defaults and a live summary", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show();
    await card();
    await user.click(screen.getAllByRole("button", { name: /Nuova routine/ })[0]);
    const dialog = await screen.findByRole("dialog");

    const create = within(dialog).getByRole("button", { name: "Crea routine" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true); // a name is required
    await user.type(within(dialog).getByLabelText("Nome"), "Lavare i denti");
    fireEvent.change(within(dialog).getByLabelText("Ora"), { target: { value: "20:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Tutti i giorni" }));
    await user.selectOptions(within(dialog).getByLabelText("Compare sulla cornice"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Caramelle" }));
    await user.click(within(dialog).getByRole("button", { name: "sparkles" }));
    expect(within(dialog).getByText("Tutti i giorni alle 20:30 · avviso 5 min prima")).toBeTruthy();

    await user.click(create);
    await waitFor(() => expect(api.createRoutine).toHaveBeenCalledWith(PIN, {
      title: "Lavare i denti", time: "20:30",
      recurrence: { frequency: "weekly", interval: 1, weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
      startDate: "2025-09-15", endDate: null, noticeMinutes: 5, autoDismissMs: 60_000, style: "sweets", icon: "sparkles"
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.listRoutines).toHaveBeenCalledTimes(2); // reloaded
  });

  it("needs at least one weekday for a weekly routine", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show();
    await card();
    await user.click(screen.getAllByRole("button", { name: /Nuova routine/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nome"), "x");
    for (const day of ["lun", "mar", "mer", "gio", "ven"]) await user.click(within(dialog).getByRole("button", { name: day }));
    expect((within(dialog).getByRole("button", { name: "Crea routine" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("switches to daily and monthly repetition", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show();
    await card();
    await user.click(screen.getAllByRole("button", { name: /Nuova routine/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nome"), "Affitto");
    await user.click(within(dialog).getByRole("button", { name: "Ogni mese" }));
    await user.selectOptions(within(dialog).getByLabelText("Giorno del mese"), "31");
    expect(within(dialog).getByText("Ogni mese, l'ultimo giorno alle 08:00 · avviso 15 min prima")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Crea routine" }));
    await waitFor(() => expect(api.createRoutine).toHaveBeenCalledWith(PIN, expect.objectContaining({
      recurrence: { frequency: "monthly", interval: 1, monthDay: 31 }
    })));
  });

  it("keeps the dialog open and shows the server's message when saving fails", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(api.createRoutine).mockRejectedValue(new ApiRequestError("endDate must not be before startDate", 400));
    show();
    await card();
    await user.click(screen.getAllByRole("button", { name: /Nuova routine/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nome"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Crea routine" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("endDate must not be before startDate");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("edits a routine", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show();
    await user.click(within(await card()).getByRole("button", { name: "Modifica" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Nome") as HTMLInputElement).value).toBe("Accompagnare i bimbi a scuola");
    fireEvent.change(within(dialog).getByLabelText("Ora"), { target: { value: "08:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(api.updateRoutine).toHaveBeenCalledWith(PIN, "r1", expect.objectContaining({ time: "08:30" })));
  });

  it.each<Routine["recurrence"]>([
    { frequency: "weekly", interval: 6, weekdays: ["mon"] },
    { frequency: "daily", interval: 365 },
    { frequency: "monthly", interval: 12, monthDay: 31 }
  ])("displays and preserves the API interval when editing a $frequency routine", async (recurrence) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(api.listRoutines).mockResolvedValue([routine({ recurrence })]);
    show();

    await user.click(within(await card()).getByRole("button", { name: "Modifica" }));
    const dialog = within(await screen.findByRole("dialog"));
    const interval = dialog.getByLabelText("Ogni") as HTMLInputElement | HTMLSelectElement;
    expect(interval.value).toBe(String(recurrence.interval));
    fireEvent.change(dialog.getByLabelText("Ora"), { target: { value: "08:30" } });
    await user.click(dialog.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(api.updateRoutine).toHaveBeenCalledWith(PIN, "r1", expect.objectContaining({
      time: "08:30", recurrence
    })));
  });

  it("only saves whole intervals within the API limits", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show();
    await user.click(within(await card()).getByRole("button", { name: "Modifica" }));
    const dialog = within(await screen.findByRole("dialog"));
    const interval = dialog.getByLabelText("Ogni");
    const save = dialog.getByRole("button", { name: "Salva modifiche" }) as HTMLButtonElement;

    for (const value of ["", "0", "1.5", "53"]) {
      fireEvent.change(interval, { target: { value } });
      expect(save.disabled).toBe(true);
    }
    expect(api.updateRoutine).not.toHaveBeenCalled();

    fireEvent.change(interval, { target: { value: "52" } });
    await user.click(save);
    await waitFor(() => expect(api.updateRoutine).toHaveBeenCalledWith(PIN, "r1", expect.objectContaining({
      recurrence: expect.objectContaining({ frequency: "weekly", interval: 52 })
    })));
  });

  it("pauses until a date, and resumes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = show();
    await user.click(within(await card()).getByRole("button", { name: "Metti in pausa" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Riprende da sola il (facoltativo)"), { target: { value: "2025-09-22" } });
    await user.click(within(dialog).getByRole("button", { name: "Metti in pausa" }));
    await waitFor(() => expect(api.pauseRoutine).toHaveBeenCalledWith(PIN, "r1", "2025-09-22"));

    view.unmount();
    vi.mocked(api.listRoutines).mockResolvedValue([routine({ status: "paused", resumeOn: "2025-09-22", nextOccurrence: null })]);
    show();
    const paused = await card();
    expect(await within(paused).findByText("In pausa fino al lun 22 set")).toBeTruthy();
    await user.click(within(paused).getByRole("button", { name: "Riprendi" }));
    await waitFor(() => expect(api.resumeRoutine).toHaveBeenCalledWith(PIN, "r1"));
  });

  it("asks before cancelling", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show();
    await user.click(within(await card()).getByRole("button", { name: "Annulla routine" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Annullare la routine?")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Mantieni" }));
    expect(api.cancelRoutine).not.toHaveBeenCalled();

    await user.click(within(await card()).getByRole("button", { name: "Annulla routine" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Annulla routine" }));
    await waitFor(() => expect(api.cancelRoutine).toHaveBeenCalledWith(PIN, "r1"));
  });

  it("skips and restores single occurrences", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(api.listRoutines).mockResolvedValue([routine({ exceptions: [{ date: "2025-09-18", kind: "skipped" }] })]);
    show();
    const item = await card();
    await user.click(within(item).getByRole("button", { name: "Prossime volte" }));
    const rows = within(item).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("domani"), expect.stringContaining("mer 17 set"), expect.stringContaining("gio 18 set")
    ]);
    expect(within(rows[2]).getByText("Saltata")).toBeTruthy();

    await user.click(within(rows[0]).getByRole("button", { name: "Salta" }));
    await waitFor(() => expect(api.skipOccurrence).toHaveBeenCalledWith(PIN, "r1", "2025-09-16"));
    await user.click(within(rows[2]).getByRole("button", { name: "Ripristina" }));
    await waitFor(() => expect(api.restoreOccurrence).toHaveBeenCalledWith(PIN, "r1", "2025-09-18"));
  });

  it("speaks English when FRAME_LOCALE is English", async () => {
    show({ locale: "en-GB", language: "en", timeZone: "Europe/Rome" });
    const item = await card();
    expect(within(item).getByText("Monday to Friday at 08:10 · shown 15 min before")).toBeTruthy();
    expect(within(item).getByText("Next: tomorrow at 08:10")).toBeTruthy();
    expect(within(item).getByRole("button", { name: "Edit" })).toBeTruthy();
  });
});
