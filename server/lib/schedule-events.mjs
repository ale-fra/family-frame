/**
 * In-process hub for schedule events (documented as the scheduleEvent webhook in openapi.mjs):
 *   timer.created     POST /api/admin/timers succeeded          (at = createdAt)
 *   timer.finished    a timer starts ringing                    (at = finishedAt)
 *   routine.upcoming  a routine enters its notice window         (at = showFrom)
 *   routine.due       a routine reaches its time                 (at = at)
 * Producers: the timers API and the schedule notifier. Consumers: the frame event stream (SSE), the optional
 * webhook and the optional startFrameServer({ onScheduleEvent }) hook. A failing consumer never affects the others
 * or the producer.
 */
export function createScheduleEvents({ log = console } = {}) {
  const listeners = new Set();

  return {
    emit(event) {
      for (const listener of listeners) {
        try {
          const result = listener(event);
          if (typeof result?.catch === "function") {
            result.catch((error) => log.error(`Schedule event listener failed for ${event.type}:`, error));
          }
        } catch (error) {
          log.error(`Schedule event listener failed for ${event.type}:`, error);
        }
      }
    },

    /** Returns an unsubscribe function. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
