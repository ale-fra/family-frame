// Minimal EventSource stand-in for jsdom tests: records instances and lets tests push server events.
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  close() {
    this.closed = true;
  }

  static reset() {
    FakeEventSource.instances = [];
  }

  static open() {
    return FakeEventSource.instances.filter((source) => !source.closed);
  }
}
