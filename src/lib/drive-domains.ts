/**
 * Domény Google Drive, které se nikdy nesmí objevit v odpovědi klientovi
 * (R6.4). Vyčleněno do samostatného (klient-safe) modulu, aby je mohly
 * konzumovat klientské komponenty (`Html5Player`) bez zatažení serverového
 * `drive-connector` (a tím `node:crypto`) do prohlížečového bundlu.
 */
export const DRIVE_DOMAINS: readonly string[] = [
  "drive.google.com",
  "googleusercontent.com",
  "www.googleapis.com",
  "googleapis.com",
] as const;
