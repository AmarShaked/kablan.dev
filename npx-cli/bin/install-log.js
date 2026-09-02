const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * The record of what an install did.
 *
 * An update that goes wrong is quiet — you find out later, when the app reports a version you
 * thought you had replaced, and by then the terminal that ran it is long gone. So every line the
 * installer prints is also appended here, with a timestamp, next to the app's own log.
 */

function logDir() {
  return path.join(os.homedir(), "Library", "Logs", "Kablan");
}

function installLogPath() {
  return path.join(logDir(), "install.log");
}

/**
 * A `log(line)` that prints and appends. Logging is never the reason an install fails: if the
 * file cannot be written the line still reaches the terminal.
 *
 * @param {object} [deps] seams for the tests
 */
function createInstallLogger(deps = {}) {
  const {
    print = (line) => console.log(line),
    file = installLogPath(),
    appendFile = (target, text) => {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, text);
    },
    stamp = () => new Date().toISOString(),
  } = deps;

  return function log(line) {
    print(line);
    try {
      appendFile(file, `${stamp()} ${line}\n`);
    } catch {
      // A read-only home directory is not a reason to abandon the update.
    }
  };
}

module.exports = { createInstallLogger, installLogPath };
