// DoneByFive Worker
// - Serves the static landing page (via the ASSETS binding).
// - Handles newsletter signups at POST /api/subscribe, storing them in D1.
// - Private two-assistant chat at /api/chat/*, storing messages in D1.
// Fix: trigger redeploy via wrangler.toml (restores ASSETS binding)

// - Password-gated Emily planner at /emily-planner/, with a shared
//   strategy-notes API at /api/planner/notes, storing notes in D1.
//   Gate: HTTP Basic Auth, username "emily", password checked only by
//   SHA-256 hash (the password itself is never in this repository).
//   This keeps casual visitors out. It is a shared-password gate for a
//   planner that holds no private credentials, not enterprise auth.
const PLANNER_USER = "emily";
const PLANNER_PASSWORD_HASH =
  "e714ee622b5881114f8f43d69246e20a81c5a514ba9c00f130c3e9cac314132c";
// Claude-only direct-access token, stored only as a hash. This token is
// separate from the shared planner password, so it can be revoked on its
// own by removing its hash here, without changing the password for Boss
// and Emily. The token itself is never in this repository.
// REVOKED Oct 29, 2026, on Boss approval, after Claude refused the token
// link in Message 28 and urged revocation. No token hash remains here.
const PLANNER_TOKEN_HASHES = [];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonical host: redirect www → apex (301), preserving path + query.
    if (url.hostname === "www.donebyfive.com") {
      url.hostname = "donebyfive.com";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api/subscribe") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed." }, 405);
      }
      return handleSubscribe(request, env);
    }

    if (url.pathname.startsWith("/api/chat/")) {
      return handleChat(request, env, url);
    }

    if (url.pathname.startsWith("/api/planner/")) {
      if (!(await plannerAuthorized(request, url))) {
        return plannerUnauthorized();
      }
      return handlePlanner(request, env, url);
    }

    if (
      url.pathname === "/emily-planner" ||
      url.pathname.startsWith("/emily-planner/")
    ) {
      if (!(await plannerAuthorized(request, url))) {
        return plannerUnauthorized();
      }
    }

    // Everything else: serve the static site.
    return env.ASSETS.fetch(request);
  },
};

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function plannerAuthorized(request, url) {
  // Direct-access token route, for Claude: a token in the URL query or
  // in the X-Planner-Token header, checked only by hash. No password
  // typing is involved on this route.
  const token =
    (url && url.searchParams.get("token")) ||
    request.headers.get("X-Planner-Token") ||
    "";
  if (token && PLANNER_TOKEN_HASHES.includes(await sha256Hex(token))) {
    return true;
  }
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  const user = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  if (user !== PLANNER_USER) return false;
  return (await sha256Hex(password)) === PLANNER_PASSWORD_HASH;
}

function plannerUnauthorized() {
  return new Response("Login required for the Emily planner.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Emily Planner"',
      "cache-control": "no-store",
    },
  });
}

async function handlePlanner(request, env, url) {
  if (!env.DB) {
    return json({ ok: false, error: "Planner notes are not configured yet." }, 500);
  }
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS planner_notes (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "author TEXT NOT NULL, " +
        "body TEXT NOT NULL, " +
        "created_at INTEGER NOT NULL)"
    ).run();

    if (url.pathname === "/api/planner/notes" && request.method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT id, author, body, created_at FROM planner_notes ORDER BY id ASC LIMIT 100"
      ).all();
      return json({ ok: true, notes: rows.results || [] });
    }

    if (url.pathname === "/api/planner/notes" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Could not read the note." }, 400);
      }
      const author = String(data.author || "").trim();
      const body = String(data.body || "").trim();
      if (!["Emily", "Claude", "Boss"].includes(author)) {
        return json({ ok: false, error: "Author must be Emily, Claude, or Boss." }, 400);
      }
      if (!body || body.length > 2000) {
        return json({ ok: false, error: "Write a note of 1 to 2000 characters." }, 400);
      }
      const result = await env.DB.prepare(
        "INSERT INTO planner_notes (author, body, created_at) VALUES (?, ?, ?)"
      )
        .bind(author, body, Math.floor(Date.now() / 1000))
        .run();
      return json({ ok: true, id: result.meta.last_row_id });
    }

    return json({ ok: false, error: "Not found." }, 404);
  } catch {
    return json({ ok: false, error: "Something went wrong saving the note." }, 500);
  }
}

async function handleSubscribe(request, env) {
  // Accept either JSON ({"email": "..."}) or a classic form POST.
  let email = "";
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      email = (body.email || "").toString();
    } else {
      const form = await request.formData();
      email = (form.get("email") || "").toString();
    }
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  email = email.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Please enter a valid email address." }, 400);
  }

  if (!env.DB) {
    return json(
      { ok: false, error: "Signups aren't configured yet. Please try again later." },
      500
    );
  }

  try {
    // Create the table on first use so no separate migration step is needed.
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS subscribers (" +
        "email TEXT PRIMARY KEY, " +
        "created_at TEXT NOT NULL, " +
        "source TEXT)"
    ).run();

    await env.DB.prepare(
      "INSERT INTO subscribers (email, created_at, source) VALUES (?, ?, ?) " +
        "ON CONFLICT(email) DO NOTHING"
    )
      .bind(email, new Date().toISOString(), "landing")
      .run();
  } catch {
    return json(
      { ok: false, error: "Something went wrong saving your email. Please try again." },
      500
    );
  }

  return json({ ok: true, message: "You're on the list." });
}

// ---------------------------------------------------------------------------
// Private chat (Emily <-> Mimi)
// ---------------------------------------------------------------------------
// Auth: X-Chat-Key must match env.CHAT_KEY_EMILY (sender "Emily") or
// env.CHAT_KEY_MUSE (sender "Mimi"). The variable is still named CHAT_KEY_MUSE;
// only the display name changed. If neither variable is set, the API
// answers 503. No keys are ever stored in this file or the repository.

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

async function ensureChatTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS chat_messages (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "sender TEXT NOT NULL, " +
      "body TEXT, " +
      "file_name TEXT, " +
      "file_type TEXT, " +
      "file_data TEXT, " +
      "file_link TEXT, " +
      "created_at INTEGER NOT NULL)"
  ).run();
}

// Returns the sender name for a valid key, or null when the key is wrong.
// Returns the string "unconfigured" when no chat key variable is set.
function chatIdentity(request, env) {
  const key = request.headers.get("X-Chat-Key") || "";
  if (!env.CHAT_KEY_EMILY && !env.CHAT_KEY_MUSE) return "unconfigured";
  if (key && env.CHAT_KEY_EMILY && key === env.CHAT_KEY_EMILY) return "Emily";
  if (key && env.CHAT_KEY_MUSE && key === env.CHAT_KEY_MUSE) return "Mimi";
  return null;
}

function cleanFileName(name) {
  const base = String(name || "")
    .split(/[\\/]/)
    .pop()
    .trim();
  return base.slice(0, 200);
}

async function handleChat(request, env, url) {
  if (!env.DB) {
    return json({ ok: false, error: "Chat storage is not configured yet." }, 500);
  }

  const identity = chatIdentity(request, env);
  if (identity === "unconfigured") {
    return json(
      { ok: false, error: "Chat keys are not configured yet." },
      503
    );
  }
  if (!identity) {
    return json({ ok: false, error: "A valid chat key is required." }, 401);
  }

  try {
    await ensureChatTable(env);

    if (url.pathname === "/api/chat/messages" && request.method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT id, sender, body, file_name, file_type, file_data, file_link, created_at " +
          "FROM chat_messages ORDER BY id DESC LIMIT 200"
      ).all();
      const messages = (rows.results || []).reverse();
      return json({ ok: true, messages });
    }

    if (url.pathname === "/api/chat/messages" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Could not read the message." }, 400);
      }
      const sender = String(data.sender || "");
      const body = String(data.body || "");
      const fileLink = data.file_link ? String(data.file_link) : null;
      if (sender !== identity) {
        return json({ ok: false, error: "The sender must match your chat key." }, 403);
      }
      if (!body && !fileLink) {
        return json({ ok: false, error: "Write a message or share a file link." }, 400);
      }
      if (body.length > 4000 || (fileLink && fileLink.length > 2000)) {
        return json({ ok: false, error: "That message is too long." }, 400);
      }
      const result = await env.DB.prepare(
        "INSERT INTO chat_messages (sender, body, file_name, file_type, file_data, file_link, created_at) " +
          "VALUES (?, ?, NULL, NULL, NULL, ?, ?)"
      )
        .bind(sender, body, fileLink, Math.floor(Date.now() / 1000))
        .run();
      return json({ ok: true, id: result.meta.last_row_id });
    }

    if (url.pathname === "/api/chat/upload" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Could not read the upload." }, 400);
      }
      const sender = String(data.sender || "");
      const body = data.body ? String(data.body) : "";
      const fileName = cleanFileName(data.file_name);
      const fileType = String(data.file_type || "application/octet-stream").slice(0, 200);
      const dataBase64 = String(data.data_base64 || "");
      if (sender !== identity) {
        return json({ ok: false, error: "The sender must match your chat key." }, 403);
      }
      if (!fileName || !dataBase64) {
        return json({ ok: false, error: "A file name and file data are required." }, 400);
      }
      if (body.length > 4000) {
        return json({ ok: false, error: "That message is too long." }, 400);
      }
      // Base64 is ~4/3 of the raw size; reject anything that decodes above 2 MB.
      const approxBytes = Math.floor((dataBase64.length * 3) / 4);
      if (approxBytes > MAX_UPLOAD_BYTES) {
        return json(
          { ok: false, error: "That file is over the 2 MB upload limit. Share it via a Google Drive link instead." },
          413
        );
      }
      const result = await env.DB.prepare(
        "INSERT INTO chat_messages (sender, body, file_name, file_type, file_data, file_link, created_at) " +
          "VALUES (?, ?, ?, ?, ?, NULL, ?)"
      )
        .bind(sender, body, fileName, fileType, dataBase64, Math.floor(Date.now() / 1000))
        .run();
      return json({ ok: true, id: result.meta.last_row_id, file_name: fileName });
    }

    return json({ ok: false, error: "Not found." }, 404);
  } catch {
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
