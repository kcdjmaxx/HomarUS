# ref-homaruscc-event-loop

- **Source:** local:../homaruscc/bin/event-loop
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** TBD
- **Status:** active
- **Summary:** Bash script that long-polls /api/wait?timeout=120. Blocks at OS level (zero Claude tokens while idle). On 204 (timeout with no events), loops again silently. On 200, prints the JSON payload and exits with instructions to restart. Uses a PID file at /tmp/ to prevent duplicate listeners. Reads port from config.json.
