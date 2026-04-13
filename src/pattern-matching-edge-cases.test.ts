/**
 * pattern-matching-edge-cases.test.ts
 *
 * Investigates whether pattern-based wait timeout behavior is intentional or a bug.
 * Tests scenarios where output appears but PTY becomes idle before the next PTY event.
 *
 * Hypothesis: If a pattern appears in output but the PTY process becomes idle
 * (no more data, no buffer change events), the wait() may timeout because check()
 * is only called on PTY events.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Session } from "../src/session";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Pattern Matching Edge Cases", () => {
  let session: Session;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pattern-test-"));
  });

  afterEach(() => {
    try {
      session.kill();
    } catch (e) {
      // ignore if already exited
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  });

  describe("Pattern appears then PTY goes idle", () => {
    it("detects pattern immediately when output appears", async () => {
      // Simple case: pattern appears, command exits
      // "echo hello" outputs immediately and exits, should detect pattern before timeout
      session = new Session("echo-test", "echo hello", {
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      const start = Date.now();
      const result = await session.wait(5000, "hello");
      const elapsed = Date.now() - start;

      // Should resolve quickly (within 500ms) since echo outputs and exits immediately
      // NOT wait for full timeout
      expect(elapsed).toBeLessThan(1000);
      expect(result.lines.join("\n")).toContain("hello");
    });

    it("detects pattern during output streaming", async () => {
      // Pattern appears mid-command before PTY goes idle
      session = new Session(
        "stream-test",
        "bash -c 'echo starting; sleep 0.1; echo hello; sleep 0.1; echo done'",
        { cwd: tempDir, cols: 80, rows: 24 }
      );

      const start = Date.now();
      const result = await session.wait(5000, "hello");
      const elapsed = Date.now() - start;

      // Pattern appears around 100ms in, should resolve soon after
      expect(elapsed).toBeLessThan(500);
      expect(result.lines.join("\n")).toContain("hello");
    });

    it("waits for pattern when command takes time to output", async () => {
      // Pattern appears after delay
      session = new Session("delayed-test", "bash -c 'sleep 0.5; echo hello'", {
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      const start = Date.now();
      const result = await session.wait(5000, "hello");
      const elapsed = Date.now() - start;

      // Should wait ~500ms for output, not timeout at 5000ms
      expect(elapsed).toBeGreaterThanOrEqual(400);
      expect(elapsed).toBeLessThan(2000);
      expect(result.lines.join("\n")).toContain("hello");
    });

    it("detects regex pattern with special characters", async () => {
      session = new Session(
        "regex-test",
        "bash -c 'echo ERROR: something failed; exit 1'",
        { cwd: tempDir, cols: 80, rows: 24 }
      );

      const start = Date.now();
      // Use regex to match "ERROR: " with escaped special chars
      const result = await session.wait(5000, "ERROR:.*failed");
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(result.lines.join("\n")).toContain("ERROR");
    });

    it("returns immediately if pattern matches on wait() entry", async () => {
      // Pre-populate output, then call wait with pattern
      session = new Session("pre-output", "echo hello && sleep 10", {
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      // Wait for hello to appear
      await session.wait(2000, "hello");

      // Now pattern already exists, second wait should return immediately
      const start = Date.now();
      const result = await session.wait(5000, "hello");
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Should be instant
      expect(result.lines.join("\n")).toContain("hello");
    });
  });

  describe("Pattern not found scenarios", () => {
    it("times out if pattern never appears", async () => {
      session = new Session("no-pattern", "echo goodbye", {
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      const start = Date.now();
      const result = await session.wait(1000, "hello");
      const elapsed = Date.now() - start;

      // Should wait for timeout (1000ms) since pattern never appears
      expect(elapsed).toBeGreaterThanOrEqual(900);
      expect(result.lines.join("\n")).not.toContain("hello");
    });

    it("times out with short timeout even if pattern might appear later", async () => {
      session = new Session("slow-output", "bash -c 'sleep 2; echo hello'", {
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      const start = Date.now();
      const result = await session.wait(500, "hello");
      const elapsed = Date.now() - start;

      // Timeout fires at 500ms, before hello appears at ~2000ms
      expect(elapsed).toBeGreaterThanOrEqual(400);
      expect(elapsed).toBeLessThan(1000);
      expect(result.lines.join("\n")).not.toContain("hello");
    });
  });

  describe("Potential event firing gaps", () => {
    it("detects pattern even if PTY data arrives in single chunk", async () => {
      // All output arrives in one write, then process exits
      // Tests that pattern check is called on onData event
      session = new Session("single-chunk", "echo -e 'line1\\nline2\\npattern\\nline3'", {
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      const start = Date.now();
      const result = await session.wait(2000, "pattern");
      const elapsed = Date.now() - start;

      // Should detect quickly since data arrives in single write
      expect(elapsed).toBeLessThan(500);
      expect(result.lines.join("\n")).toContain("pattern");
    });

    it("detects pattern after rapid output bursts", async () => {
      // Multiple rapid outputs without delays
      session = new Session(
        "rapid-output",
        "bash -c 'for i in 1 2 3 pattern 5 6; do echo $i; done'",
        { cwd: tempDir, cols: 80, rows: 24 }
      );

      const start = Date.now();
      const result = await session.wait(2000, "pattern");
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(result.lines.join("\n")).toContain("pattern");
    });
  });

  describe("Pattern matching with interactive commands", () => {
    it("detects pattern in interactive command prompt", async () => {
      // Start `cat` and send pattern to stdin
      session = new Session("interactive-cat", "cat", {
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      // Type pattern into stdin
      session.send("hello world");
      session.press("enter");

      const start = Date.now();
      const result = await session.wait(2000, "hello world");
      const elapsed = Date.now() - start;

      // Should detect the echo'd input
      expect(elapsed).toBeLessThan(1000);
      expect(result.lines.join("\n")).toContain("hello world");
    });
  });

  describe("Pattern matching behavior analysis", () => {
    it("documents the timing of pattern detection", async () => {
      // This test documents actual behavior for future reference
      // If pattern detection is slow, this helps identify why
      session = new Session(
        "timing-test",
        "bash -c 'echo MARKER_START; sleep 0.05; echo PATTERN_HERE; sleep 0.05; echo MARKER_END'",
        { cwd: tempDir, cols: 80, rows: 24 }
      );

      const start = Date.now();
      const result = await session.wait(3000, "PATTERN_HERE");
      const elapsed = Date.now() - start;

      console.log(`Pattern detection timing: ${elapsed}ms`);
      console.log(
        `Expected: ~50-100ms (initial output delay + PTY write latency)`
      );
      console.log(`Actual output:\n${result.lines.join("\n")}`);

      // Document the actual behavior
      expect(result.lines.join("\n")).toContain("PATTERN_HERE");
      // Don't assert timing here - just document it via console
    });

    it("tests whether pattern is checked on every PTY event", async () => {
      // If check() is called on every PTY event, pattern should be detected
      // when data arrives, not just when looking ahead.
      // This helps determine if there's a gap where pattern is missed.
      session = new Session("pty-event-test", "bash", {
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      // Send a command that outputs pattern
      session.send("echo TESTPATTERN");
      session.press("enter");

      const start = Date.now();
      const result = await session.wait(3000, "TESTPATTERN");
      const elapsed = Date.now() - start;

      // If pattern is checked on PTY.onData, should be fast
      // If there's a gap, might be slower
      console.log(`Interactive pattern detection: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(1000);
      expect(result.lines.join("\n")).toContain("TESTPATTERN");
    });
  });
});
