/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current content font size and fixes the palette to dark,
 * then writes the same DOM fields ui-layout's ThemePresenter owns after the
 * client plugin tree activates.
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, type ThemePreference } from './theme-settings.ts'

/** Build the inline script body for one schema-validated durable theme section. */
function bootThemeScript(_preference: ThemePreference, fontSize: number): string {
  return `(() => {
  document.documentElement.style.colorScheme = 'dark'
  document.body.setAttribute('data-ds-dark-theme', '')
  document.body.style.setProperty('--dsh-content-font-size', ${JSON.stringify(`${fontSize}px`)})
})()`
}

/**
 * The theme bootstrap as an injection row: an inline script immediately after
 * the opening body tag, before the shell mount and module script.
 * @param preference - Retained schema input; the fixed-dark product ignores it.
 * @param fontSize - Current Host-backed content font size in px.
 * @returns the body script row.
 */
export function bootThemeInjection(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSize: number = DEFAULT_FONT_SIZE,
): IndexInjection {
  return { kind: 'script', placement: 'body', text: bootThemeScript(preference, fontSize) }
}
