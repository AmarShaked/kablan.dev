import { spawn } from "node:child_process";

export type OpenTarget = "vscode" | "cursor" | "terminal" | "iterm" | "finder" | "url";

/**
 * Launch an external app/URL. `arg` is a directory path (editors/terminal/finder)
 * or a URL ("url"). Resolves when the launcher exits 0, rejects with its error
 * (e.g. the editor CLI isn't installed) so the UI can surface it.
 */
export function openTarget(target: OpenTarget, arg: string): Promise<void> {
  const plat = process.platform;
  let cmd: string;
  let args: string[];

  switch (target) {
    case "url":
      cmd = plat === "darwin" ? "open" : plat === "win32" ? "explorer" : "xdg-open";
      args = [arg];
      break;
    case "finder":
      cmd = plat === "darwin" ? "open" : plat === "win32" ? "explorer" : "xdg-open";
      args = [arg];
      break;
    case "terminal":
      if (plat === "darwin") {
        cmd = "open";
        args = ["-a", "Terminal", arg];
      } else if (plat === "win32") {
        cmd = "cmd";
        args = ["/c", "start", "cmd", "/K", `cd /d ${arg}`];
      } else {
        cmd = "x-terminal-emulator";
        args = [];
      }
      break;
    case "iterm":
      cmd = "open";
      args = ["-a", "iTerm", arg];
      break;
    case "vscode":
      cmd = "code";
      args = [arg];
      break;
    case "cursor":
      cmd = "cursor";
      args = [arg];
      break;
    default:
      return Promise.reject(new Error(`Unknown open target: ${target}`));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", (e: NodeJS.ErrnoException) =>
      reject(new Error(e.code === "ENOENT" ? `${cmd} is not installed or not on PATH` : e.message)),
    );
    child.on("exit", (code) => (code === 0 || code === null ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
  });
}
