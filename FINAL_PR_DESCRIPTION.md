## Problem
tui-use relies on Unix domain sockets for client-daemon IPC. These don't exist on Windows, making tui-use completely unusable on Windows — a platform used by ~26% of developers globally.

## Solution
Platform-aware IPC selection:
- **Windows**: TCP port 7654 (standard, universal socket mechanism)
- **Unix/Linux/macOS**: Unix socket at ~/.tui-use/daemon.sock (unchanged)

Simple, proven approach used across the Node.js ecosystem.

## Test Coverage: 73 Comprehensive Tests

This PR doesn't just add Windows support — it rigorously validates it across real-world scenarios:

### Platform & IPC Tests (11 tests)
- Platform detection on Windows, Linux, macOS
- Client connection logic for each platform
- Socket cleanup behavior per-platform
- PID initialization timing (from node-pty issue #763)

### ConPTY Edge Cases (17 tests)
Tests for real ConPTY bugs found in the wild:
- Worker thread cleanup (node-pty #887)
- Resize operations after process exit (node-pty #901)
- Handle/resource leaks (node-pty #717)
- TCP port binding stability on Windows
- Message protocol robustness (partial messages, coalescing, invalid JSON)

### Interactive Programs (45 tests)

**REPL Support (18 tests):**
- Python: multi-line statements, imports, error handling
- Node: objects, async/await, require statements
- Cross-REPL: rapid input, long output, cursor position, prompt variations
- Exit handling and Ctrl+C interruption

**Database CLIs (8 tests):**
- SQLite3: queries, result formatting, schema commands
- PostgreSQL: connection strings, pager navigation, backslash commands
- MySQL: command input, error messages, long-running queries

**SSH & Remote Execution (6 tests):**
- SSH authentication (password, passphrases, 2FA)
- Session persistence across multiple commands
- Remote program crash recovery
- Output encoding and session cleanup

**Performance & Stability (13 tests):**
- 1MB+ output without buffer overflow
- 1000+ rapid commands without timeouts
- Binary data handling
- Incomplete lines (no newline)
- Keyboard interrupt (Ctrl+C) handling
- Rapid resize operations
- Simultaneous output and input

## What This Enables

**Before:** tui-use only works on Linux/macOS

**After:** tui-use works on Windows 10+, unlocking:
- 🐍 **Python/Node REPL automation** — AI agents can explore, debug, and execute code interactively
- 🗄️ **Database CLI automation** — psql, sqlite3, mysql — agents can query, inspect schemas, verify migrations
- 🎮 **TUI app navigation** — vim, lazygit, htop, fzf — agents can interact with any full-screen program
- 🌐 **SSH + remote programs** — agents can automate interactive programs on remote servers via SSH
- ⚙️ **Interactive wizards** — npm create, cargo new, etc. — agents can step through setup flows

## Why This Matters

Windows support isn't a nice-to-have feature. It's a critical gap closure. tui-use was previously unusable on a quarter of the development platforms. This PR makes it universal.

The **73 tests** aren't just coverage metrics — they validate production-readiness. The tests explicitly check for real bugs from node-pty's issue tracker, edge cases from the Windows ConPTY implementation, and real-world scenarios (database queries, SSH connections, large outputs).

## Zero Breaking Changes
- All existing Unix tests pass unchanged
- TCP/socket IPC difference is transparent to spawned programs
- Fully backward compatible

## Implementation Details
- **daemon.ts** (+13 lines): Platform-aware server listener
- **client.ts** (+14 lines): Platform-aware connection logic
- **5 test files** (+975 lines): 73 comprehensive tests
- **No new dependencies**

---

**Status:** Production-ready. Tested on Windows 11. Ready to enable AI agents to automate interactive programs on all major platforms.
