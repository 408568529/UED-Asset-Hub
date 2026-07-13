import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function getEncryptionKey() {
  const secret = process.env.TEST_ENV_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("该测试环境密码使用旧加密密钥保存，当前无法读取。");
  }
  return createHash("sha256").update(secret).digest();
}

export function isServerEncryptionConfigured() {
  return Boolean(process.env.TEST_ENV_ENCRYPTION_KEY?.trim());
}

export function encryptServerValue(value: string) {
  if (!isServerEncryptionConfigured()) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptServerValue(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) return value;
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
