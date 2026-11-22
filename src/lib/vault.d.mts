// جسر تصريحات: يجعل TypeScript يرى تصريحات vault.d.ts عند استيراد './vault.mjs'.
// لا يغيّر vault.mjs ولا vault.d.ts — يعيد تصدير تصريحاتهما فقط.
export * from "./vault.d.ts";
