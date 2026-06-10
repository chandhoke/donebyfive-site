// DoneByFive Worker
// - Serves the static landing page (via the ASSETS binding).
// - Handles newsletter signups at POST /api/subscribe, storing them in D1.
// Fix: trigger redeploy via wrangler.toml (restores ASSETS binding)

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

    // Everything else: serve the static site.
    return env.ASSETS.fetch(request);
  },
};

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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
