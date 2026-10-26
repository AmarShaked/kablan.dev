const { test } = require("node:test");
const assert = require("node:assert");

const { createProgressReporter } = require("../bin/cli");

/**
 * The observed failure: `npx kablan > install.log 2>&1` on a clean machine produced about 700
 * lines of progress for one 15MB download, because `\r` is a carriage return in a terminal and
 * just another byte in a file.
 */

/** A download of `total` bytes delivered in `chunks` equal pieces. */
function download(reporter, total, chunks) {
  for (let i = 1; i <= chunks; i += 1) {
    reporter.update(Math.round((total / chunks) * i), total);
  }
  reporter.done();
}

const FIFTEEN_MB = 15 * 1024 * 1024;

function record(isTTY) {
  const written = [];
  const reporter = createProgressReporter({ isTTY, write: (text) => written.push(text) });
  return { written, reporter };
}

test("a terminal gets one line, rewritten in place", () => {
  const { written, reporter } = record(true);
  download(reporter, FIFTEEN_MB, 200);

  const updates = written.filter((w) => w.startsWith("\r"));
  assert.strictEqual(updates.length, 200, "every chunk redraws the line");
  assert.strictEqual(written[written.length - 1], "\n", "and the line is closed at the end");
  assert.match(updates[updates.length - 1], /15\.0MB \/ 15\.0MB \(100%\)/);
});

test("a log file gets a handful of whole lines, not one per chunk", () => {
  const { written, reporter } = record(false);
  download(reporter, FIFTEEN_MB, 700);

  assert.ok(
    written.length <= 6,
    `700 chunks should not produce ${written.length} lines; that was the bug`
  );
  assert.ok(
    written.every((line) => !line.includes("\r")),
    "a carriage return in a log file is just a stray byte"
  );
  assert.ok(
    written.every((line) => line.endsWith("\n")),
    "lines in a log have to end"
  );
});

test("the non-TTY lines are the quarter marks, then a final one", () => {
  const { written, reporter } = record(false);
  download(reporter, 100 * 1024 * 1024, 100);

  assert.deepStrictEqual(written.map((l) => l.trim()), [
    "Downloading: 25.0MB / 100.0MB (25%)",
    "Downloading: 50.0MB / 100.0MB (50%)",
    "Downloading: 75.0MB / 100.0MB (75%)",
    "Downloaded 100.0MB",
  ]);
});

test("a download with no content-length still reports that it finished", () => {
  // Some mirrors and proxies drop the header; percentages are then unknowable, but silence
  // through a 15MB download looks like a hang.
  const { written, reporter } = record(false);
  reporter.update(5 * 1024 * 1024, undefined);
  reporter.update(FIFTEEN_MB, undefined);
  reporter.done();

  assert.deepStrictEqual(written.map((l) => l.trim()), ["Downloaded 15.0MB"]);
});

test("a download that never starts says nothing at all", () => {
  const { written, reporter } = record(false);
  reporter.done();
  assert.deepStrictEqual(written, []);
});
