// CRC: crc-EventQueue.md | Seq: seq-message-dispatch.md
import type { Event, Logger } from "./types.js";

export type OverflowStrategy = "drop_lowest" | "delay" | "reject";

export class EventQueue {
  private queue: Event[] = [];
  private maxSize: number;
  private overflowStrategy: OverflowStrategy;
  private logger: Logger;

  constructor(logger: Logger, maxSize = 1000, overflowStrategy: OverflowStrategy = "drop_lowest") {
    this.logger = logger;
    this.maxSize = maxSize;
    this.overflowStrategy = overflowStrategy;
  }

  // CRC: crc-EventQueue.md — enqueue()
  enqueue(event: Event): boolean {
    if (this.isFull()) {
      return this.handleOverflow(event);
    }
    this.insertByPriority(event);
    return true;
  }

  // CRC: crc-EventQueue.md — dequeue()
  dequeue(): Event | undefined {
    return this.queue.shift();
  }

  // CRC: crc-EventQueue.md — peek()
  peek(): Event | undefined {
    return this.queue[0];
  }

  // CRC: crc-EventQueue.md — size()
  size(): number {
    return this.queue.length;
  }

  // CRC: crc-EventQueue.md — isFull()
  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  // CRC: crc-EventQueue.md — clear()
  clear(): Event[] {
    const remaining = [...this.queue];
    this.queue = [];
    return remaining;
  }

  private insertByPriority(event: Event): void {
    const priority = event.priority ?? 0;
    // Higher priority = earlier in queue. Same priority = FIFO.
    let i = this.queue.length;
    while (i > 0 && (this.queue[i - 1].priority ?? 0) < priority) {
      i--;
    }
    this.queue.splice(i, 0, event);
  }

  private handleOverflow(event: Event): boolean {
    switch (this.overflowStrategy) {
      case "drop_lowest": {
        // Drop the lowest priority event (last in queue)
        const dropped = this.queue.pop();
        if (dropped) {
          this.logger.warn("Queue full, dropped lowest priority event", {
            droppedId: dropped.id,
            droppedType: dropped.type,
          });
        }
        this.insertByPriority(event);
        return true;
      }
      case "reject": {
        this.logger.warn("Queue full, rejecting event", { eventId: event.id, eventType: event.type });
        return false;
      }
      case "delay": {
        // In delay mode, we still accept but log a warning
        this.logger.warn("Queue at capacity, event delayed", { eventId: event.id, size: this.queue.length });
        this.insertByPriority(event);
        return true;
      }
    }
  }
}
