import { createHmac } from "crypto";

/**
 * Sign a payload as a short-lived web token (base64url body + HMAC signature).
 * @param {object} payload - Data to encode (exp will be added automatically)
 * @param {string} secret - HMAC secret (bot token)
 * @param {number} ttlSeconds - Token lifetime in seconds (default 60)
 * @returns {string} Token in the format "body.sig"
 */
export function signWebToken(payload, secret, ttlSeconds = 60) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = { ...payload, exp };
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Verify a web token and return its decoded payload, or null if invalid/expired.
 * @param {string} token - Token in the format "body.sig"
 * @param {string} secret - HMAC secret (bot token)
 * @returns {object|null} Decoded payload or null
 */
export function verifyWebToken(token, secret) {
  if (!token) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof data?.exp !== "number" ||
      data.exp < Math.floor(Date.now() / 1000)
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
