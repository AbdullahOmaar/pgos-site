// PGOS Vault — E2EE device-key encryption for snapshot bundles.
// Single implementation used by the browser app, the sync pipeline and the
// round-trip test. Format: docs/VAULT-FORMAT.md.
const subtle = globalThis.crypto.subtle;
const HKDF_INFO = new TextEncoder().encode("pgos/v1/dek-wrap");
export const VAULT_ALG = "P256-ECDH+HKDF-SHA256+A256GCM";

// ---------- byte helpers ----------
export function b64uEncode(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64uDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---------- device keys ----------
export async function generateDeviceKeyPair(extractable = false) {
  return subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, extractable, ["deriveBits"]);
}
export async function exportPublicRaw(publicKey) {
  return new Uint8Array(await subtle.exportKey("raw", publicKey));
}
export async function importPublicRaw(raw) {
  return subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, true, []);
}
export async function fingerprintOf(rawPub) {
  const digest = new Uint8Array(await subtle.digest("SHA-256", rawPub));
  const hex = [...digest.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.replace(/(.{4})(?=.)/g, "$1-");
}
export async function devicePublicInfo(publicKey) {
  const raw = await exportPublicRaw(publicKey);
  return { pub: b64uEncode(raw), fp: await fingerprintOf(raw), raw };
}

// ---------- wrap / unwrap ----------
async function deriveKek(privateKey, peerPublicKey, saltRawPub) {
  const shared = await subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, privateKey, 256);
  const hkdfKey = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: saltRawPub, info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapSnapshot(plaintextBytes, devices) {
  const dek = random(32);
  const dekKey = await subtle.importKey("raw", dek, { name: "AES-GCM" }, false, ["encrypt"]);
  const payloadIv = random(12);
  const payloadCt = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: payloadIv }, dekKey, plaintextBytes)
  );
  const wraps = [];
  for (const dev of devices) {
    const devicePub = await importPublicRaw(b64uDecode(dev.pub));
    const eph = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const ephRaw = await exportPublicRaw(eph.publicKey);
    const kek = await deriveKek(eph.privateKey, devicePub, ephRaw);
    const iv = random(12);
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, kek, dek));
    wraps.push({
      device: dev.id,
      fp: dev.fp || (await fingerprintOf(b64uDecode(dev.pub))),
      eph: b64uEncode(ephRaw),
      iv: b64uEncode(iv),
      ct: b64uEncode(ct),
    });
  }
  return {
    v: 1,
    alg: VAULT_ALG,
    created_at: new Date().toISOString(),
    payload: { iv: b64uEncode(payloadIv), ct: b64uEncode(payloadCt) },
    wraps,
  };
}

export class VaultError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function unwrapSnapshot(bundle, keyPair) {
  if (!bundle || bundle.v !== 1) throw new VaultError("BAD_BUNDLE", "حزمة لقطة غير صالحة");
  const info = await devicePublicInfo(keyPair.publicKey);
  const wrap = (bundle.wraps || []).find((w) => w.fp === info.fp);
  if (!wrap) throw new VaultError("NO_WRAP", "لا يوجد تغليف لهذا الجهاز في اللقطة الحالية");
  const ephPub = await importPublicRaw(b64uDecode(wrap.eph));
  const kek = await deriveKek(keyPair.privateKey, ephPub, b64uDecode(wrap.eph));
  let dek;
  try {
    dek = new Uint8Array(
      await subtle.decrypt({ name: "AES-GCM", iv: b64uDecode(wrap.iv) }, kek, b64uDecode(wrap.ct))
    );
  } catch {
    throw new VaultError("UNWRAP_FAIL", "فشل فك تغليف مفتاح اللقطة");
  }
  const dekKey = await subtle.importKey("raw", dek, { name: "AES-GCM" }, false, ["decrypt"]);
  try {
    const pt = await subtle.decrypt(
      { name: "AES-GCM", iv: b64uDecode(bundle.payload.iv) },
      dekKey,
      b64uDecode(bundle.payload.ct)
    );
    return new Uint8Array(pt);
  } catch {
    throw new VaultError("DECRYPT_FAIL", "فشل فك تشفير اللقطة");
  }
}

// ---------- IndexedDB device-key persistence (browser only) ----------
const IDB_NAME = "pgos-vault";
const IDB_STORE = "keys";
const IDB_REC = "device";
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
export async function loadDeviceKeyPair() {
  if (typeof indexedDB === "undefined") return null;
  const rec = await idbGet(IDB_REC);
  return rec && rec.privateKey && rec.publicKey ? rec : null;
}
export async function saveDeviceKeyPair(pair) {
  return idbPut(IDB_REC, { privateKey: pair.privateKey, publicKey: pair.publicKey });
}
export async function createAndSaveDeviceKeyPair() {
  const pair = await generateDeviceKeyPair(false);
  await saveDeviceKeyPair(pair);
  return pair;
}
export async function importDevicePrivateKeyJwk(jwk) {
  const privateKey = await subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
  const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  const publicKey = await subtle.importKey(
    "jwk",
    pubJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
  const pair = { privateKey, publicKey };
  await saveDeviceKeyPair(pair);
  return pair;
}
