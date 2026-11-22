#!/usr/bin/env node
// بناء جاهز للنشر المشفّر: يبني ثم يحذف النسخة الواضحة من dist
// ويثبت أن ما تبقى لا يحمل أي معرف حقيقي. أي فشل = خروج غير صفري
// (حتى لا يُرفع dist فيه نسخة واضحة بالخطأ).
import { execSync } from "node:child_process";
import { existsSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const PLAIN = join(DIST, "data", "site-data.json");
const ENC = join(DIST, "data", "snapshot.enc.json");
const MARKERS = ["3A-316", "L-0017", "TOTO-001", "3A Automation — المقر المشترك"];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

execSync("npm run build", { stdio: "inherit" });

if (!existsSync(ENC)) {
  console.error("FAIL: snapshot.enc.json missing in dist — run `npm run data:encrypt` first");
  process.exit(1);
}
if (existsSync(PLAIN)) rmSync(PLAIN);

const leaks = [];
for (const f of walk(DIST)) {
  const buf = readFileSync(f);
  for (const m of MARKERS) if (buf.includes(Buffer.from(m, "utf8"))) leaks.push(`${f}: ${m}`);
}
if (leaks.length) {
  console.error("FAIL: plaintext markers leaked into dist:");
  for (const l of leaks) console.error("  " + l);
  process.exit(1);
}
console.log("ENCRYPTED BUILD OK: plaintext removed, snapshot.enc.json present, no markers in dist");
