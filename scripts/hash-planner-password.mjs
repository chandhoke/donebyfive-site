// Generates the value for the PLANNER_PASSWORD_HASH Worker secret.
//
// Run it locally, never in a shared terminal log. The password is read from
// stdin so it does not end up in shell history or process listings:
//
//   node scripts/hash-planner-password.mjs
//   (type the new password, press Enter)
//
// Then store the printed line as the secret:
//
//   npx wrangler secret put PLANNER_PASSWORD_HASH
//
// Format: pbkdf2$<iterations>$<saltHex>$<hashHex> (SHA-256). The Worker's
// WebCrypto allows at most 100000 iterations.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const ITERATIONS = 100000;
const rl = createInterface({ input: process.stdin, terminal: false });
const lines = [];
rl.on("line", (line) => lines.push(line));
rl.on("close", () => {
  const password = (lines[0] || "").replace(/\r$/, "");
  if (password.length < 16) {
    console.error("Use a password of at least 16 characters.");
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  console.log(`pbkdf2$${ITERATIONS}$${salt.toString("hex")}$${hash.toString("hex")}`);
});
