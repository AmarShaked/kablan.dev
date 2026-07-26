// Minimal stream-json mock agent for supervisor tests. Ignores CLI flags.
// Emits one init, then per stdin user-message an assistant + result. A message
// containing "FAILME" yields an error result. "QUIT" ends the process.
import readline from "node:readline";
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
emit({ type: "system", subtype: "init", session_id: "mock-session-1", model: "mock", permissionMode: "acceptEdits" });
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (l) => {
  let text = "";
  try { text = (JSON.parse(l).message?.content || []).map((b) => b.text || "").join(""); } catch { return; }
  if (text.includes("QUIT")) { process.exit(0); }
  const isErr = text.includes("FAILME");
  emit({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: `echo:${text}` }] }, session_id: "mock-session-1" });
  emit({ type: "result", subtype: isErr ? "error" : "success", is_error: isErr, result: `echo:${text}`, session_id: "mock-session-1" });
});
rl.on("close", () => process.exit(0));
