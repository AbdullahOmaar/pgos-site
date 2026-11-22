export const VAULT_ALG: string;
export class VaultError extends Error {
  code: string;
  constructor(code: string, message: string);
}
export interface DevicePublicInfo {
  pub: string;
  fp: string;
  raw: Uint8Array;
}
export interface WrapEntry {
  device: string;
  fp: string;
  eph: string;
  iv: string;
  ct: string;
}
export interface VaultBundle {
  v: 1;
  alg: string;
  created_at: string;
  payload: { iv: string; ct: string };
  wraps: WrapEntry[];
}
export function b64uEncode(bytes: Uint8Array | ArrayBuffer): string;
export function b64uDecode(str: string): Uint8Array;
export function generateDeviceKeyPair(extractable?: boolean): Promise<CryptoKeyPair>;
export function exportPublicRaw(publicKey: CryptoKey): Promise<Uint8Array>;
export function importPublicRaw(raw: Uint8Array): Promise<CryptoKey>;
export function fingerprintOf(rawPub: Uint8Array): Promise<string>;
export function devicePublicInfo(publicKey: CryptoKey): Promise<DevicePublicInfo>;
export function wrapSnapshot(
  plaintextBytes: Uint8Array,
  devices: { id: string; pub: string; fp?: string }[]
): Promise<VaultBundle>;
export function unwrapSnapshot(bundle: VaultBundle, keyPair: CryptoKeyPair): Promise<Uint8Array>;
export function loadDeviceKeyPair(): Promise<CryptoKeyPair | null>;
export function saveDeviceKeyPair(pair: CryptoKeyPair): Promise<boolean>;
export function createAndSaveDeviceKeyPair(): Promise<CryptoKeyPair>;
export function importDevicePrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKeyPair>;
