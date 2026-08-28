export function initServerSetup(): string {
  if (process.env.OPAQUE_SERVER_SETUP) {
    return process.env.OPAQUE_SERVER_SETUP
  }
  return 'QcHqVTRjuUfuM8Hlu6Zp6fd8WMDPYdDWekOh4flxWfHBpGTcyn1pS1TCEZNJ5wJ-mXYZjb539WJ9ShzGjyh2BMjhhl8WAOu_qkQ-o1_DX-_22g2Z7UEu1aGDs4-ZaG8LZgLGu41u3XOS9wF12EX0iJU1uzKGo1b-g50ZY4g7hQg'; //opaque.server.createSetup()
}

/**
 * Get OPAQUE Record in Core API
 */
export async function getOpaque(username: string): Promise<string | null> {
  const apiUrl = `${process.env.CORE_API_URL}/api/internal/auth/opaque`

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CORE_API_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ username }),
    })

    if (!response.ok) return null
    const data = await response.json()
    return data.opaque || null
  } catch (error) {
    console.error("Can't get OPAQUE record from Core API:", error)
    return null
  }
}

export  async function setOpaque(
  payload: {
    username: string
    opaque: string
  },
  t: (key: string) => string
): Promise<{ success: boolean; message?: string }> {
  const apiUrl = `${process.env.CORE_API_URL}/api/internal/opaque/set`

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CORE_API_INTERNAL_SECRET}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 400) {
        return { success: false, message: t("init.errors.invalidCredentials") }
      }
      return { success: false, message: t("init.errors.generic") }
    }

    return { success: true }
  } catch (error) {
    console.error(`[CoreAPI] Error during init for user ${payload.username}:`, error)
    return {
      success: false,
      message: t("init.errors.generic"),
    }
  }
}