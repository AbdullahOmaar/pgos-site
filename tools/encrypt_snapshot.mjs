// خطوة تشفير اللقطة — خطوة النشر في خط البناء.
// يقرأ public/data/site-data.json (ناتج npm run data) + tools/devices.json
// (مفاتيح عمومية فقط لأجهزة المالك المسجلة) وينتج public/data/snapshot.enc.json
// بصيغة الخزنة v1 (انظر docs/VAULT-FORMAT.md وdocs/VAULT-INTEGRATION.md).
// التشغيل: npm run data:encrypt
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wrapSnapshot } from "./vault.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plainPath = path.join(ROOT, "public/data/site-data.json");
const devicesPath = path.join(ROOT, "tools/devices.json");
const outPath = path.join(ROOT, "public/data/snapshot.enc.json");

if (!existsSync(plainPath)) {
  console.error("لا يوجد public/data/site-data.json — شغّل `npm run data` أولًا.");
  process.exit(1);
}

const devices = existsSync(devicesPath)
  ? JSON.parse(readFileSync(devicesPath, "utf-8"))
  : [];
if (!Array.isArray(devices)) {
  console.error("tools/devices.json لازم يكون مصفوفة من {id, pub, fp}.");
  process.exit(1);
}
for (const d of devices) {
  if (!d || typeof d.id !== "string" || typeof d.pub !== "string") {
    console.error("كل جهاز في tools/devices.json لازم يكون فيه id وpub (مفتاح عمومي base64url).");
    process.exit(1);
  }
}

const plain = readFileSync(plainPath); // بايتات كما هي — تُشفّر دون إعادة تسلسل
const bundle = await wrapSnapshot(new Uint8Array(plain), devices);
writeFileSync(outPath, JSON.stringify(bundle, null, 1) + "\n");

console.log(
  JSON.stringify({
    out: path.relative(ROOT, outPath),
    alg: bundle.alg,
    plain_bytes: plain.length,
    devices_wrapped: bundle.wraps.length,
    device_ids: bundle.wraps.map((w) => w.device),
  })
);
if (devices.length === 0) {
  console.warn(
    "تنبيه: لا أجهزة مسجلة — اللقطة مشفرة لكنها غير مغلّفة لأي جهاز (لا يستطيع أحد فتحها بعد)."
  );
}
