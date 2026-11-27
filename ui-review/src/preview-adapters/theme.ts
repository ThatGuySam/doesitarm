import { useSyncExternalStore } from "react"

export type ReviewTheme = "dark" | "light"

const storageKey = "doesitarm.ui.theme"
const themeChange = "doesitarm-ui-theme-change"

export function getTheme(): ReviewTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark"
}

export function setTheme(theme: string) {
  const next = theme === "light" ? "light" : "dark"
  document.documentElement.dataset.theme = next
  document.documentElement.classList.toggle("dark", next === "dark")
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) meta.setAttribute("content", next)
  if (window.parent === window && !new URLSearchParams(window.location.search).has("preview")) {
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // A sandboxed or private window can still preview both themes.
    }
  }
  window.dispatchEvent(new Event(themeChange))
}

function subscribe(listener: () => void) {
  window.addEventListener(themeChange, listener)
  return () => window.removeEventListener(themeChange, listener)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme)
  return { theme, resolvedTheme: theme, setTheme }
}
