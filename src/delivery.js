// DoneByFive delivery backend, DRAFT, Nov 3, 2026, test mode only.
// This is a standalone draft module, NOT yet merged into donebyfive-site
// src/index.js, NOT deployed, and NOT connected to live Stripe.
// Merge only on Boss explicit go, after the secrets below are set in
// Cloudflare Workers, never in this file or in the repository.
//
// Required Worker secrets, set by Boss in Cloudflare, never in code:
//   STRIPE_SECRET_KEY        - Stripe test secret key (sandbox), sk_test_...
//   STRIPE_WEBHOOK_SECRET    - Stripe test webhook signing secret, whsec_...
//   DOWNLOAD_TOKEN_SECRET    - Random 32+ character secret, for signing tokens
//   EMAIL_API_KEY            - Email provider API key, if email delivery is used
// Required bindings, to be added in wrangler.toml on merge:
//   R2 bucket "FILES"        - Private bucket holding the 10 clean delivery files
//   D1 database "DB"         - Already used by the site for signups/planner
//
// Product map: Stripe price ID -> clean delivery file in R2. Includes sandbox prices and classic test prices created Nov 3, 2026.
// File names must match the verified clean set, with Rental / Repair /
// Landlord bundles verified against the PR #101 rebuilt set before live.
export const PRODUCT_FILES = {
  "price_1UXiHsQ1kgMeTTuRFyhJmiwa": "Grocery Category Sales Tracker.xlsx",
  "price_1UXiHzQ1kgMeTTuRPRK38637": "Reorder Point and Par Level Calculator.xlsx",
  "price_1UXiI0Q1kgMeTTuRBOg22vGn": "Device Repair Job Ticket Tracker.xlsx",
  "price_1UXiI1Q1kgMeTTuRCg0W2rYd": "Parts Inventory Reorder Tracker.xlsx",
  "price_1UXiI2Q1kgMeTTuR88qWQ0Mx": "Repair Shop Cash Book Daily Sales Log.xlsx",
  "price_1UXiI4Q1kgMeTTuR9qQb0x2c": "Rental Property Income and Expense Ledger.xlsx",
  "price_1UXiI5Q1kgMeTTuRMsZ5m2IA": "Multi-Unit Property Dashboard.xlsx",
  "price_1UXiI6Q1kgMeTTuRh24U7LMq": "Retail Starter Bundle.zip",
  "price_1UXiI7Q1kgMeTTuRbMrQJDYt": "Repair Shop Starter Bundle.zip",
  "price_1UXiI8Q1kgMeTTuRtKKfcAw9": "Landlord Starter Bundle.zip",
  "price_1UXmUoQ8u6FiPZ7W5D0zdDoT": "Reorder Point and Par Level Calculator.xlsx",
  "price_1UXmWPQ8u6FiPZ7WlwghQKt3": "Device Repair Job Ticket Tracker.xlsx",
  "price_1UXmXsQ8u6FiPZ7WNLvVCxTN": "Parts Inventory Reorder Tracker.xlsx",
  "price_1UXmZWQ8u6FiPZ7WjBqi5L9Y": "Repair Shop Cash Book Daily Sales Log.xlsx",
  "price_1UXmawQ8u6FiPZ7WVDTi42Gi": "Rental Property Income and Expense Ledger.xlsx",
  "price_1UXmcUQ8u6FiPZ7W31BoWqBD": "Multi-Unit Property Dashboard.xlsx",
  "price_1UXmdwQ8u6FiPZ7WfKaOiGVL": "Retail Starter Bundle.zip",
  "price_1UXmfGQ8u6FiPZ7W0EN86Sgc": "Repair Shop Starter Bundle.zip",
  "price_1UXmgwQ8u6FiPZ7Wyj8ZUQrO": "Landlord Starter Bundle.zip",
};

export const PAYMENT_LINK_FILES = {
  "plink_1UXjJgQ8u6FiPZ7Wnf9CP8cT": "Grocery Category Sales Tracker.xlsx",
  "plink_1UXiJIQ1kgMeTTuReXCSeMUx": "Grocery Category Sales Tracker.xlsx",
  "plink_1UXiJKQ1kgMeTTuR6Q1UwPfr": "Reorder Point and Par Level Calculator.xlsx",
  "plink_1UXiJLQ1kgMeTTuRCVcNOpr2": "Device Repair Job Ticket Tracker.xlsx",
  "plink_1UXiJMQ1kgMeTTuRTYNxvoXa": "Parts Inventory Reorder Tracker.xlsx",
  "plink_1UXiJNQ1kgMeTTuRB3TW5BsH": "Repair Shop Cash Book Daily Sales Log.xlsx",
  "plink_1UXiJOQ1kgMeTTuR6otdy6VA": "Rental Property Income and Expense Ledger.xlsx",
  "plink_1UXiJQQ1kgMeTTuRbyo3rbBV": "Multi-Unit Property Dashboard.xlsx",
  "plink_1UXiJRQ1kgMeTTuRQbjQptYm": "Retail Starter Bundle.zip",
  "plink_1UXiJSQ1kgMeTTuRWtjrOd2i": "Repair Shop Starter Bundle.zip",
  "plink_1UXiJTQ1kgMeTTuR0kZmQZgM": "Landlord Starter Bundle.zip",
  "plink_1UXmVaQ8u6FiPZ7WBLO10ZXo": "Reorder Point and Par Level Calculator.xlsx",
  "plink_1UXmWvQ8u6FiPZ7WLAVA0fE8": "Device Repair Job Ticket Tracker.xlsx",
  "plink_1UXmYdQ8u6FiPZ7WmNx28lmG": "Parts Inventory Reorder Tracker.xlsx",
  "plink_1UXma7Q8u6FiPZ7WTHf8V7En": "Repair Shop Cash Book Daily Sales Log.xlsx",
  "plink_1UXmbYQ8u6FiPZ7Wp2gJVOLC": "Rental Property Income and Expense Ledger.xlsx",
  "plink_1UXmd4Q8u6FiPZ7WN5w4DKeq": "Multi-Unit Property Dashboard.xlsx",
  "plink_1UXmeUQ8u6FiPZ7WstYki9Lj": "Retail Starter Bundle.zip",
  "plink_1UXmg0Q8u6FiPZ7Wx1DWmAYK": "Repair Shop Starter Bundle.zip",
  "plink_1UXmhUQ8u6FiPZ7W6xA1AkWS": "Landlord Starter Bundle.zip",
};

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const TOKEN_MAX_DOWNLOADS = 3;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Token format: <orderId>.<expiryUnix>.<hmac>
// The token itself carries no file path, no email, and no payment secret.
// Verification re-checks the HMAC, the expiry, the download count in D1,
// and that the order is paid and not refunded.
export async function makeDownloadToken(secret, orderId, expiryUnix) {
  const sig = await hmacHex(secret, `${orderId}.${expiryUnix}`);
  return `${orderId}.${expiryUnix}.${sig}`;
}

export async function verifyDownloadToken(secret, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [orderId, expiryRaw, sig] = parts;
  const expiry = Number(expiryRaw);
  if (!orderId || !Number.isFinite(expiry)) return null;
  if (expiry * 1000 < Date.now()) return null;
  const expected = await hmacHex(secret, `${orderId}.${expiry}`);
  if (sig !== expected) return null;
  return { orderId, expiry };
}

export async function ensureDeliveryTables(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS delivery_orders (" +
      "id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, price_id TEXT NOT NULL, " +
      "file_name TEXT NOT NULL, buyer_email TEXT, amount INTEGER, currency TEXT, " +
      "status TEXT NOT NULL, created_at INTEGER NOT NULL)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS delivery_tokens (" +
      "token TEXT PRIMARY KEY, order_id TEXT NOT NULL, downloads INTEGER NOT NULL DEFAULT 0, " +
      "expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)"
  ).run();
}

// POST /api/stripe/webhook
// Verifies the Stripe signature with Web Crypto, no Stripe library needed
// in the Worker. Only checkout.session.completed and payment_intent.succeeded
// for a known sandbox price create an order. Anything else is ignored, 200.
export async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.DB) {
    return json({ ok: false, error: "Delivery is not configured yet." }, 503);
  }
  const signature = request.headers.get("stripe-signature") || "";
  const rawBody = await request.text();
  // Stripe signature: t=<timestamp>,v1=<hmac of t.rawBody>
  // A full timestamp tolerance check belongs here on merge, with a 5 minute window.
  const v1 = (signature.match(/v1=([a-f0-9]+)/) || [])[1];
  const t = (signature.match(/t=(\d+)/) || [])[1];
  if (!v1 || !t) return json({ ok: false, error: "Missing signature." }, 400);
  const expected = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${t}.${rawBody}`);
  if (v1 !== expected) return json({ ok: false, error: "Bad signature." }, 400);

  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ ok: false, error: "Bad JSON." }, 400); }
  if (event.type !== "checkout.session.completed" && event.type !== "payment_intent.succeeded") {
    return json({ ok: true, ignored: true });
  }
  const obj = event.data?.object || {};
  // Checkout Session webhook objects do NOT include line_items by default,
  // so price alone cannot be trusted here. Try, in order: expanded line
  // items, metadata, payment_link mapping, then a Stripe API line-items
  // fetch using the test secret key already set in the Worker.
  let priceId = obj?.line_items?.data?.[0]?.price?.id || obj?.metadata?.price_id || "";
  let fileName = priceId ? PRODUCT_FILES[priceId] : null;
  if (!fileName && obj?.payment_link) {
    fileName = PAYMENT_LINK_FILES[obj.payment_link];
  }
  if (!fileName && env.STRIPE_SECRET_KEY && obj?.id && event.type === "checkout.session.completed") {
    try {
      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${obj.id}/line_items?limit=1`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (res.ok) {
        const data = await res.json();
        priceId = data?.data?.[0]?.price?.id || priceId;
        fileName = priceId ? PRODUCT_FILES[priceId] : null;
      }
    } catch { /* fall through to unknown price below */ }
  }
  if (!fileName) return json({ ok: true, ignored: true, reason: "Unknown price." });

  await ensureDeliveryTables(env);
  const orderId = obj.id || event.id;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO delivery_orders " +
      "(id, payment_id, price_id, file_name, buyer_email, amount, currency, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?)"
  ).bind(orderId, obj.payment_intent || orderId, priceId, fileName,
    obj.customer_details?.email || obj.receipt_email || null,
    obj.amount_total ?? obj.amount ?? null, obj.currency || "cad",
    Math.floor(Date.now() / 1000)).run();
  if (env.DOWNLOAD_TOKEN_SECRET) {
    const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = await makeDownloadToken(env.DOWNLOAD_TOKEN_SECRET, orderId, expiry);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO delivery_tokens (token, order_id, downloads, expires_at, created_at) VALUES (?, ?, 0, ?, ?)"
    ).bind(token, orderId, expiry, Math.floor(Date.now() / 1000)).run();
  }
  // Email delivery is a separate step on merge: send the token link with
  // the configured email provider, using env.EMAIL_API_KEY. Do not send
  // the file as an attachment, and do not put the file in a public folder.
  return json({ ok: true, order_id: orderId, file_name: fileName });
}

// GET /download/<token>
// Checks token, expiry, download count, and order status, then serves the
// file from the private R2 FILES bucket. No token, no file. No listing.
export async function handleDownload(request, env, token) {
  if (!env.DOWNLOAD_TOKEN_SECRET || !env.DB || !env.FILES) {
    return json({ ok: false, error: "Download is not configured yet." }, 503);
  }
  const verified = await verifyDownloadToken(env.DOWNLOAD_TOKEN_SECRET, token);
  if (!verified) return json({ ok: false, error: "This download link is invalid or expired." }, 403);
  await ensureDeliveryTables(env);
  const row = await env.DB.prepare(
    "SELECT * FROM delivery_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row) return json({ ok: false, error: "This download link is invalid or expired." }, 403);
  if (row.expires_at * 1000 < Date.now()) return json({ ok: false, error: "This download link has expired." }, 403);
  if (row.downloads >= TOKEN_MAX_DOWNLOADS) return json({ ok: false, error: "This download link has already been used." }, 403);
  const order = await env.DB.prepare(
    "SELECT * FROM delivery_orders WHERE id = ? AND status = 'paid'"
  ).bind(row.order_id).first();
  if (!order) return json({ ok: false, error: "This order is not available for download." }, 403);
  const file = await env.FILES.get(order.file_name);
  if (!file) return json({ ok: false, error: "File not found. Contact support." }, 404);
  await env.DB.prepare(
    "UPDATE delivery_tokens SET downloads = downloads + 1 WHERE token = ?"
  ).bind(token).run();
  return new Response(file.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${order.file_name}"`,
      "cache-control": "no-store",
    },
  });
}

// POST /api/delivery/lookup { session_id }
// Buyer-facing step, no email provider needed. If the webhook already
// created a paid order for this session, return its download URL from
// D1 first, without depending on a Stripe session fetch. Only if no
// paid order exists yet, verify the Checkout Session with Stripe using
// the test secret key, check payment_status is paid, then create the
// order and token if the webhook has not run yet.
// Only the buyer who holds the paid session id can get its link, and
// only for a paid session. Never returns a link for an unpaid session.
// Fix Nov 3, 2026: the previous order checked Stripe first, so a
// webhook-created paid order still returned 404 "Session not found"
// when the Worker secret key could not fetch that session from Stripe.
export async function handleDeliveryLookup(request, env) {
  if (!env.STRIPE_SECRET_KEY || !env.DOWNLOAD_TOKEN_SECRET || !env.DB) {
    return json({ ok: false, error: "Delivery is not configured yet." }, 503);
  }
  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: "Bad request." }, 400); }
  const sessionId = String(data.session_id || "").trim();
  if (!sessionId.startsWith("cs_")) return json({ ok: false, error: "Invalid session." }, 400);
  await ensureDeliveryTables(env);
  let order = await env.DB.prepare("SELECT * FROM delivery_orders WHERE id = ?").bind(sessionId).first();
  let session = null;
  if (!order) {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) return json({ ok: false, error: "Session not found." }, 404);
    session = await res.json();
    if (session.payment_status !== "paid") {
      return json({ ok: false, error: "Payment is not complete yet." }, 402);
    }
  }
  if (!order) {
    // Webhook has not run yet: create the order from the verified session.
    const itemsRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=1`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    const items = itemsRes.ok ? await itemsRes.json() : null;
    const priceId = items?.data?.[0]?.price?.id || "";
    let fileName = priceId ? PRODUCT_FILES[priceId] : null;
    if (!fileName && session.payment_link) fileName = PAYMENT_LINK_FILES[session.payment_link];
    if (!fileName) return json({ ok: false, error: "Product not recognised." }, 400);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO delivery_orders (id, payment_id, price_id, file_name, buyer_email, amount, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?)"
    ).bind(sessionId, session.payment_intent || sessionId, priceId, fileName,
      session.customer_details?.email || null, session.amount_total ?? null, session.currency || "cad",
      Math.floor(Date.now() / 1000)).run();
    order = await env.DB.prepare("SELECT * FROM delivery_orders WHERE id = ?").bind(sessionId).first();
  }
  if (!order || order.status !== "paid") return json({ ok: false, error: "Order not available." }, 403);
  let tokenRow = await env.DB.prepare("SELECT * FROM delivery_tokens WHERE order_id = ? ORDER BY created_at DESC LIMIT 1").bind(sessionId).first();
  if (!tokenRow) {
    const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = await makeDownloadToken(env.DOWNLOAD_TOKEN_SECRET, sessionId, expiry);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO delivery_tokens (token, order_id, downloads, expires_at, created_at) VALUES (?, ?, 0, ?, ?)"
    ).bind(token, sessionId, expiry, Math.floor(Date.now() / 1000)).run();
    tokenRow = await env.DB.prepare("SELECT * FROM delivery_tokens WHERE order_id = ? ORDER BY created_at DESC LIMIT 1").bind(sessionId).first();
  }
  return json({ ok: true, file_name: order.file_name, download_url: `/download/${tokenRow.token}` });
}
