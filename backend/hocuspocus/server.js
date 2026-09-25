// Yjs/Hocuspocus side-service: syncs canvas presence/cursors/node layout ONLY.
// Business logic + authorization stay in FastAPI: every connection is authenticated by asking the
// backend for the caller's role in that workspace (document name == workspace id).
// Roles: view -> read-only connection, control/approve -> may edit the shared canvas.
import { Server } from "@hocuspocus/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";
const PORT = Number(process.env.PORT || 1234);

const server = Server.configure({
  port: PORT,
  name: "uaw-canvas",
  async onAuthenticate({ documentName, token, connection }) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${BACKEND}/api/workspaces/${encodeURIComponent(documentName)}`, { headers });
    if (!res.ok) throw new Error("not authorized for this workspace");
    const ws = await res.json();
    if (ws.role === "view") connection.readOnly = true; // watchers see live state but cannot move things
    return { role: ws.role };
  },
});

server.listen();
console.log(`hocuspocus listening on :${PORT}, backend ${BACKEND}`);
