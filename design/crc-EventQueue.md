# EventQueue
**Requirements:** R8

## Knows
- queue: PriorityQueue<Event> (events sorted by priority then arrival order)
- maxSize: number (from config)
- overflowStrategy: "drop_lowest" | "delay" | "reject"

## Does
- enqueue(event): Add event to queue, apply backpressure if full
- dequeue(): Remove and return highest-priority event
- peek(): Return next event without removing
- size(): Current queue depth
- isFull(): Whether queue is at maxSize
- clear(): Drain all events (for shutdown)

## Collaborators
- Homarus: enqueues events, dequeues for processing

## Sequences
- seq-message-dispatch.md
