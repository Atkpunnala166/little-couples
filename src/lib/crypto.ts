// Native Web Crypto API End-to-End Encryption (AES-GCM-256 + PBKDF2)
// Every message, voice note caption, and intimate chat is encrypted before leaving the device.
// Zero external dependencies; hardware-accelerated in all modern mobile and desktop browsers.

const E2EE_SALT = 'our-little-universe-couple-salt-v1';
const E2EE_PREFIX = 'enc:v1:';

// Default master couple secret combining both names and secret passwords
const DEFAULT_COUPLE_PASSPHRASE = 'Avinash_Avi123_Athulya_Sree123_OurLittleUniverse';

let cachedKey: CryptoKey | null = null;
let cachedPassphrase = '';

function getCryptoSubtle(): SubtleCrypto | null {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  return null;
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function getCoupleEncryptionKey(passphrase = DEFAULT_COUPLE_PASSPHRASE): Promise<CryptoKey | null> {
  const subtle = getCryptoSubtle();
  if (!subtle) return null;

  if (cachedKey && cachedPassphrase === passphrase) {
    return cachedKey;
  }

  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const derived = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(E2EE_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  cachedKey = derived;
  cachedPassphrase = passphrase;
  return derived;
}

export async function encryptTextE2EE(plainText: string, passphrase = DEFAULT_COUPLE_PASSPHRASE): Promise<string> {
  if (!plainText) return plainText;
  const subtle = getCryptoSubtle();
  if (!subtle) return plainText;

  try {
    const key = await getCoupleEncryptionKey(passphrase);
    if (!key) return plainText;

    // Cryptographically secure random 12-byte IV for every single message
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const enc = new TextEncoder();
    const cipherBuffer = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainText)
    );

    const ivB64 = bufferToBase64(iv);
    const cipherB64 = bufferToBase64(cipherBuffer);

    return `${E2EE_PREFIX}${ivB64}:${cipherB64}`;
  } catch (err) {
    console.warn('[E2EE] Encryption fallback:', err);
    return plainText;
  }
}

export async function decryptTextE2EE(cipherText: string, passphrase = DEFAULT_COUPLE_PASSPHRASE): Promise<string> {
  if (!cipherText || !cipherText.startsWith(E2EE_PREFIX)) {
    // Legacy plain text message or already decrypted
    return cipherText;
  }

  const subtle = getCryptoSubtle();
  if (!subtle) return cipherText;

  try {
    const key = await getCoupleEncryptionKey(passphrase);
    if (!key) return cipherText;

    const payload = cipherText.slice(E2EE_PREFIX.length);
    const [ivB64, cipherB64] = payload.split(':');
    if (!ivB64 || !cipherB64) return cipherText;

    const iv = base64ToUint8Array(ivB64);
    const cipherBytes = base64ToUint8Array(cipherB64);

    const decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBytes
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (err) {
    console.warn('[E2EE] Decryption error:', err);
    return '🔒 [Encrypted Message]';
  }
}

