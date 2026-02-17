// Test: test-Homarus.md
// Tests the core event loop components without starting the full Homarus server.
// We test EventBus + EventQueue integration directly since Homarus.start() requires
// real filesystem config, channels, HTTP server, etc.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "./event-bus.js";
import { EventQueue } from "./event-queue.js";
import type { Event, Logger } from "./types.js";

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    type: "test_event",
    source: "test",
    timestamp: Date.now(),
    payload: {},
    ...overrides,
  };
}

describe("Homarus event dispatch", () => {
  let bus: EventBus;
  let queue: EventQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    bus = new EventBus(logger);
    queue = new EventQueue(logger);
  });

  it("dispatches event to registered direct handler", async () => {
    const handler = vi.fn();
    bus.registerDirect("test_event", handler);

    const event = makeEvent({ payload: { data: "hello" } });
    const handlers = bus.getHandlers(event.type);

    for (const h of handlers.direct) {
      await h(event);
    }

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
    expect((handler.mock.calls[0][0] as Event).payload).toEqual({ data: "hello" });
  });

  it("dispatches event to agent handler config", () => {
    bus.registerAgent("message", {
      id: "handler-1",
      agentConfig: { prompt: "handle it" },
    });

    const event = makeEvent({ type: "message" });
    const handlers = bus.getHandlers(event.type);

    expect(handlers.agent.length).toBe(1);
    expect(handlers.agent[0].id).toBe("handler-1");
  });

  it("fires multiple handlers for same event type", async () => {
    const direct1 = vi.fn();
    const direct2 = vi.fn();
    bus.registerDirect("message", direct1);
    bus.registerDirect("message", direct2);
    bus.registerAgent("message", { id: "agent-1", agentConfig: {} });

    const event = makeEvent({ type: "message" });
    const handlers = bus.getHandlers("message");

    for (const h of handlers.direct) {
      await h(event);
    }

    expect(direct1).toHaveBeenCalledOnce();
    expect(direct2).toHaveBeenCalledOnce();
    expect(handlers.agent.length).toBe(1);
  });
});

describe("Homarus event queue", () => {
  let queue: EventQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new EventQueue(logger);
  });

  it("enqueues and dequeues events in priority order", () => {
    queue.enqueue(makeEvent({ id: "low", priority: 0 }));
    queue.enqueue(makeEvent({ id: "high", priority: 10 }));
    queue.enqueue(makeEvent({ id: "mid", priority: 5 }));

    expect(queue.dequeue()!.id).toBe("high");
    expect(queue.dequeue()!.id).toBe("mid");
    expect(queue.dequeue()!.id).toBe("low");
  });

  it("respects FIFO within same priority", () => {
    queue.enqueue(makeEvent({ id: "first", priority: 0 }));
    queue.enqueue(makeEvent({ id: "second", priority: 0 }));
    queue.enqueue(makeEvent({ id: "third", priority: 0 }));

    expect(queue.dequeue()!.id).toBe("first");
    expect(queue.dequeue()!.id).toBe("second");
    expect(queue.dequeue()!.id).toBe("third");
  });
});

describe("Homarus backpressure", () => {
  it("rejects events when queue is full with reject strategy", () => {
    const queue = new EventQueue(logger, 3, "reject");

    expect(queue.enqueue(makeEvent({ id: "1" }))).toBe(true);
    expect(queue.enqueue(makeEvent({ id: "2" }))).toBe(true);
    expect(queue.enqueue(makeEvent({ id: "3" }))).toBe(true);
    expect(queue.enqueue(makeEvent({ id: "4" }))).toBe(false);

    expect(queue.size()).toBe(3);
  });

  it("drops lowest priority when full with drop_lowest strategy", () => {
    const queue = new EventQueue(logger, 3, "drop_lowest");

    queue.enqueue(makeEvent({ id: "p5", priority: 5 }));
    queue.enqueue(makeEvent({ id: "p3", priority: 3 }));
    queue.enqueue(makeEvent({ id: "p1", priority: 1 }));

    // Queue is now full. Insert high priority — should drop lowest (p1)
    queue.enqueue(makeEvent({ id: "p10", priority: 10 }));

    expect(queue.size()).toBe(3);
    const ids = [];
    while (queue.size() > 0) ids.push(queue.dequeue()!.id);
    expect(ids).toEqual(["p10", "p5", "p3"]);
  });

  it("clears queue and returns remaining events", () => {
    const queue = new EventQueue(logger);
    queue.enqueue(makeEvent({ id: "a" }));
    queue.enqueue(makeEvent({ id: "b" }));

    const remaining = queue.clear();
    expect(remaining.length).toBe(2);
    expect(queue.size()).toBe(0);
  });
});

describe("Homarus shutdown", () => {
  it("graceful shutdown drains remaining events", () => {
    const queue = new EventQueue(logger);
    queue.enqueue(makeEvent({ id: "e1" }));
    queue.enqueue(makeEvent({ id: "e2" }));

    // Simulate shutdown drain
    const drained = queue.clear();
    expect(drained.length).toBe(2);
    expect(queue.size()).toBe(0);
  });
});
