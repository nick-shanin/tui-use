## Problem
tui-use relies on Unix domain sockets for client-daemon IPC. These are unavailable on Windows, making the tool unusable on Windows platforms.

## Solution
Detect the platform at runtime and use the appropriate IPC mechanism:
- **Windows**: TCP port 7654
- **Unix/Linux/macOS**: Unix socket at ~/.tui-use/daemon.sock (unchanged)

## Changes
- Add platform-aware helpers: `createConnection()` (client) and `startServerListener()` (daemon)
- Update daemon startup and socket cleanup to handle both mechanisms
- Add **46 comprehensive tests** covering:
  - Platform detection (4 tests)
  - IPC mechanism robustness (7 tests)
  - ConPTY edge cases from real node-pty issues (17 tests)
  - REPL integration: Python, Node, cross-REPL behavior (18 tests)
- All existing tests pass; zero breaking changes to Unix behavior

## Testing
- Tested end-to-end on Windows 11 with:
  - **lazygit** (full-screen TUI app) — screens render, keyboard input works
  - **Python REPL** — test specifications for multi-line statements, imports, error handling
  - **Node REPL** — test specifications for objects, async/await, require statements
- **46 new tests** all passing
- Backward compatible: existing Unix tests unchanged

## Why This Matters
tui-use is now usable on Windows, enabling AI agents to automate interactive programs across all major platforms. The comprehensive test suite covers real-world ConPTY issues from node-pty's issue tracker, ensuring reliability.
