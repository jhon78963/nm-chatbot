import { api } from './api/client'

export interface ChatbotBranding {
  botName: string
  primaryColor: string | null
  logoUrl: string | null
}

let current: ChatbotBranding = { botName: 'Asistente', primaryColor: null, logoUrl: null }

export function getBotName(): string {
  return current.botName
}

export function getBranding(): ChatbotBranding {
  return current
}

export function applyChatbotBranding(branding: ChatbotBranding): void {
  current = {
    botName: branding.botName.trim() || 'Asistente',
    primaryColor: branding.primaryColor,
    logoUrl: branding.logoUrl,
  }
  document.title = `${current.botName} — Panel de agentes`
  if (current.logoUrl) {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    icon.href = current.logoUrl
  }
  if (!branding.primaryColor) return
  const root = document.documentElement
  root.style.setProperty('--clr-primary', branding.primaryColor)
  root.style.setProperty('--clr-unread', branding.primaryColor)
  root.style.setProperty('--clr-primary-dark', darkenHex(branding.primaryColor, 24))
}

export async function loadChatbotBranding(): Promise<void> {
  try {
    const branding = await api.get<ChatbotBranding>('/api/v1/branding')
    applyChatbotBranding({
      botName: branding.botName,
      primaryColor: branding.primaryColor,
      logoUrl: branding.logoUrl ?? null,
    })
  } catch {
    await loadPublicChatbotBranding()
  }
}

export async function loadPublicChatbotBranding(): Promise<void> {
  try {
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
    const res = await fetch(`${base}/api/chat/widget/config`)
    if (!res.ok) return
    const branding = (await res.json()) as ChatbotBranding
    applyChatbotBranding({
      botName: branding.botName,
      primaryColor: branding.primaryColor,
      logoUrl: branding.logoUrl ?? null,
    })
  } catch {
    /* keep defaults */
  }
}

function darkenHex(hex: string, amount: number): string {
  const raw = hex.replace('#', '')
  if (raw.length !== 6) return hex
  const value = Number.parseInt(raw, 16)
  if (!Number.isFinite(value)) return hex
  const channel = (shift: number) => Math.max(0, ((value >> shift) & 255) - amount)
  const r = channel(16)
  const g = channel(8)
  const b = channel(0)
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
