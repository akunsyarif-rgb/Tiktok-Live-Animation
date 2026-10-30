// Standalone local Phoenix/Realtime-like server for E2E. stdin commands: drop | pause | resume | quit
import { startPhoenixServer } from "./phoenix-server.ts";

const srv = await startPhoenixServer();
console.log(JSON.stringify({ url: srv.url }));
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (d: string) => {
  for (const cmd of d.split("\n").map((x) => x.trim()).filter(Boolean)) {
    if (cmd === "drop") srv.dropAll();
    else if (cmd === "pause") srv.pause(true);
    else if (cmd === "resume") srv.pause(false);
    else if (cmd === "quit") { await srv.close(); process.exit(0); }
  }
});
