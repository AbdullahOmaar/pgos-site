// إثبات round-trip لصيغة الخزنة — مكيّف من pgos-app/scripts/vault-test.mjs.
// الفحوص الإلزامية:
//   1) تشفير بجهاز مسجل ← فك ناجح وبايتات مطابقة (round-trip كامل).
//   2) جهاز غير مسجل يُرفض (NO_WRAP).
//   3) عبث ببايت واحد في الحمولة يُرفض (AES-GCM).
//   4) نفس الفحوص على ملف البيانات الحقيقي public/data/site-data.json إن وُجد.
// التشغيل: npm run vault:test
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDeviceKeyPair,
  devicePublicInfo,
  wrapSnapshot,
  unwrapSnapshot,
} from "./vault.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
};

async function runSuite(label, sample) {
  const deviceA = await generateDeviceKeyPair(true);
  const infoA = await devicePublicInfo(deviceA.publicKey);
  const bundle = await wrapSnapshot(sample, [
    { id: "test-device", pub: infoA.pub, fp: infoA.fp },
  ]);

  // 1) round-trip
  let rtOk = false;
  try {
    const out = await unwrapSnapshot(bundle, deviceA);
    rtOk = Buffer.from(out).equals(Buffer.from(sample));
  } catch {
    rtOk = false;
  }
  check(`[${label}] round-trip مطابق للبايتات`, rtOk, `fp ${infoA.fp}`);

  // 2) جهاز غير مسجل
  const deviceB = await generateDeviceKeyPair(true);
  let noWrapCode = null;
  try {
    await unwrapSnapshot(bundle, deviceB);
  } catch (e) {
    noWrapCode = e.code;
  }
  check(`[${label}] جهاز غير مسجل مرفوض`, noWrapCode === "NO_WRAP", `code=${noWrapCode}`);

  // 3) عبث ببايت في الحمولة
  const tampered = JSON.parse(JSON.stringify(bundle));
  const ct = tampered.payload.ct;
  tampered.payload.ct = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
  let tamperCode = null;
  try {
    await unwrapSnapshot(tampered, deviceA);
  } catch (e) {
    tamperCode = e.code;
  }
  check(`[${label}] حمولة معبوت بها مرفوضة`, tamperCode !== null, `code=${tamperCode}`);
}

const sample = new TextEncoder().encode(
  JSON.stringify({ hello: "PGOS — توتو", n: 42, nested: { ok: true } })
);
await runSuite("عينة", sample);

const realPath = path.join(ROOT, "public/data/site-data.json");
if (existsSync(realPath)) {
  await runSuite("site-data.json الحقيقي", new Uint8Array(readFileSync(realPath)));
} else {
  console.log("• تخطّي Suite الملف الحقيقي — public/data/site-data.json غير موجود (شغّل npm run data).");
}

if (failures === 0) {
  console.log("VAULT TEST: PASS");
} else {
  console.error(`VAULT TEST: FAIL (${failures})`);
  process.exit(1);
}
