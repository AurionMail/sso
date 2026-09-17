import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const SECRET_KEY = crypto
  .createHash("sha256")
  .update(process.env.SESSION_SECRET || "DEFAULT_INSECURE_SECRET")
  .digest()

export function encryptState(payload: object): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv)
  
  let encrypted = cipher.update(JSON.stringify(payload), "utf8", "base64url")
  encrypted += cipher.final("base64url")
  
  const authTag = cipher.getAuthTag().toString("base64url")
  
  //Format: iv.authTag.encryptedData
  return `${iv.toString("base64url")}.${authTag}.${encrypted}`
}

export function decryptState(stateParam: string): any {
  const parts = stateParam.split(".")
  if (parts.length !== 3) throw new Error("Invalid state payload format")

  const [ivHex, authTagHex, encryptedText] = parts
  const iv = Buffer.from(ivHex, "base64url")
  const authTag = Buffer.from(authTagHex, "base64url")

  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedText, "base64url", "utf8")
  decrypted += decipher.final("utf8")

  return JSON.parse(decrypted)
}