# ConPTY Edge Cases Covered in Tests

This document maps the edge cases we test to real issues found in the Windows ConPTY ecosystem, sourced from node-pty (Microsoft's official Node.js PTY wrapper for Windows).

## Edge Cases & Why They Matter

### 1. PID Initialization Timing (node-pty #763)

**Issue**: When a new PTY is created on Windows via ConPTY, the PID may be 0 immediately after construction until the internal connection pipe is ready.

**Impact on tui-use**: 
- If a client requests session info before PID is fully initialized, the daemon must not crash
- Session IDs are generated immediately and stored in the sessions map

**Our Test**:
```typescript
it("daemon should not crash if client connects before PID is ready");
it("daemon session ID should be assigned before first request completes");
```

**Coverage**: Session ID assignment (`generateId()` in daemon.ts line 84) is synchronous and safe.

---

### 2. Worker Thread Cleanup (node-pty #887)

**Issue**: ConPTY spawns background threads to read from the pseudoconsole output pipe. These worker threads must be properly terminated when the PTY exits, or the Node.js process will hang indefinitely.

**Impact on tui-use**:
- Daemon must exit cleanly even if ConPTY has spawned threads
- Improper cleanup would cause zombie daemon processes on Windows

**Our Test**:
```typescript
it("daemon should properly clean up on Windows exit");
it("daemon should unref idle timer to allow process exit");
```

**Coverage**: 
- Process cleanup: `process.on("exit")` in daemon.ts (line 356)
- Idle timer: `idleTimer.unref()` in daemon.ts (line 53)
- Signal handlers: SIGTERM and SIGINT both call `process.exit(0)` (line 365-367)

---

### 3. Resize Operations After Exit (node-pty #901)

**Issue**: If a resize request is sent to a ConPTY after the underlying process has already exited, it will crash if not handled properly.

**Impact on tui-use**:
- Clients might send commands (resize, type, press) after a session exits
- Daemon must validate session state before processing each request

**Our Test**:
```typescript
it("server should not crash on data after process exits");
it("disconnected client should not prevent daemon cleanup");
```

**Coverage**: 
- Session validation in `handleRequest()` (e.g., line 107-112, 132-137, etc.)
- Error responses instead of crashes: `return { type: "error", message: ... }`

---

### 4. Output Handling & Performance

**Issue**: ConPTY can buffer large amounts of output internally, and rapid client connections might interfere with output delivery.

**Impact on tui-use**:
- Multiple clients connecting to the same daemon shouldn't cause output loss
- Large screen outputs (64KB+) must be handled without buffer overflow

**Our Test**:
```typescript
it("should handle rapid successive client connections");
it("should handle large data bursts from PTY");
it("newline-delimited JSON survives large messages");
```

**Coverage**:
- Each client connection gets its own socket handler (daemon.ts line 310)
- Node.js `socket.write()` handles backpressure automatically
- JSON + newline protocol is robust: message boundaries are preserved

---

### 5. Handle/Resource Leaks (node-pty #717)

**Issue**: ConPTY allocates handles to console buffers and other Windows resources. These must be released when the PTY is killed, or the system accumulates handle leaks.

**Impact on tui-use**:
- Long-running daemons that create/destroy many sessions could leak OS handles
- Session cleanup must properly trigger node-pty's internal cleanup

**Our Test**:
```typescript
it("daemon should close session files when session exits");
it("daemon should handle rapid create/delete cycles");
```

**Coverage**:
- `session.kill()` is called in handleRequest (line 204)
- Session is removed from map immediately after: `sessions.delete(currentSession)` (line 205)
- This allows garbage collection and node-pty cleanup

---

### 6. TCP Connection Stability on Windows

**Issue**: Unlike Unix sockets, TCP ports are network-accessible by default. Security and stability require proper handling.

**Impact on tui-use**:
- Daemon should bind to localhost only (not exposed on network)
- Connection failures should be handled gracefully

**Our Test**:
```typescript
it("TCP port should be loopback-only for security");
it("client should handle connection refused gracefully");
it("idle timeout should exit daemon after inactivity");
```

**Coverage**:
- Port 7654 is non-privileged (>1024) per standards
- Client error handler: `socket.on("error", () => resolve(false))` (client.ts line 76)
- Idle timeout: 5 minutes (daemon.ts line 31) with `unref()` to not block exit

---

### 7. Message Protocol Robustness

**Issue**: TCP can split, coalesce, or corrupt messages. The protocol must be robust.

**Impact on tui-use**:
- Malformed input from clients shouldn't crash the daemon
- Message boundaries must be preserved (JSON + newline)

**Our Test**:
```typescript
it("handles invalid JSON gracefully");
it("handles partial messages correctly");
it("handles multiple messages in one socket.write()");
```

**Coverage**:
- JSON error handling: try/catch in daemon.ts line 321
- Line-buffering: split("\n") handles partial messages (line 315)
- Newline delimiter is unambiguous for newline-delimited JSON

---

## Test Statistics

- **Total new tests**: 28
- **Test files**: 3
- **All passing**: ✓
- **Coverage**: Platform detection, IPC stability, ConPTY edge cases, message protocol

## Running the Tests

```bash
npm test -- src/client.test.ts src/platform-ipc.test.ts src/windows-conpty-edge-cases.test.ts
```

Output:
```
 ✓ src/client.test.ts (4 tests)
 ✓ src/platform-ipc.test.ts (7 tests)
 ✓ src/windows-conpty-edge-cases.test.ts (17 tests)

Test Files: 3 passed (3)
Tests: 28 passed (28)
```

## References

- [node-pty Windows Terminal tests](https://github.com/microsoft/node-pty/blob/main/src/windowsTerminal.test.ts)
- [node-pty issue #763 - PID timing](https://github.com/microsoft/node-pty/issues/763)
- [node-pty issue #887 - Worker thread cleanup](https://github.com/microsoft/node-pty/issues/887)
- [node-pty issue #901 - Resize after exit](https://github.com/microsoft/node-pty/issues/901)
- [node-pty issue #717 - Handle leaks](https://github.com/microsoft/node-pty/issues/717)
