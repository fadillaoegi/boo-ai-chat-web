/**
 * Menghasilkan src/design/tokens.css dari src/design/tokens.ts.
 * Jalankan dengan `pnpm tokens` setiap kali token diubah.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  borderWidth,
  depth,
  fixedColor,
  fontFamily,
  radius,
  themedColor,
  type Theme,
} from '../src/design/tokens.ts'

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function themeBlock(selector: string, theme: Theme): string {
  const lines = Object.entries(themedColor)
    .map(([name, value]) => `  --boo-${kebab(name)}: ${value[theme]};`)
  return `${selector} {\n${lines.join('\n')}\n}`
}

function fixedBlock(): string {
  return Object.entries(fixedColor)
    .map(([name, value]) => `  --boo-${kebab(name)}: ${value};`)
    .join('\n')
}

function shadowTokens(): string {
  const variants: Array<{ suffix: string; color: string }> = [
    { suffix: '', color: 'var(--boo-shadow)' },
    { suffix: '-soft', color: 'var(--boo-shadow-soft)' },
    { suffix: '-inverse', color: 'var(--boo-shadow-inverse)' },
    { suffix: '-danger', color: 'var(--boo-shadow-danger)' },
  ]
  return variants
    .flatMap(({ suffix, color }) => Object.entries(depth)
      .map(([name, px]) => `  --shadow-boo${suffix}-${name}: ${px}px ${px}px 0 ${color};`))
    .join('\n')
}

function colorTokens(): string {
  return [...Object.keys(themedColor), ...Object.keys(fixedColor)]
    .map((name) => `  --color-boo-${kebab(name)}: var(--boo-${kebab(name)});`)
    .join('\n')
}

function radiusTokens(): string {
  return Object.entries(radius)
    .map(([name, value]) => `  --radius-boo-${name}: ${value};`)
    .join('\n')
}

const css = `/**
 * DIGENERATE OTOMATIS oleh scripts/gen-tokens.ts — jangan diedit manual.
 * Ubah src/design/tokens.ts lalu jalankan \`pnpm tokens\`.
 */

${themeBlock(':root', 'light')}

${themeBlock(':root.dark', 'dark')}

:root {
${fixedBlock()}
  --boo-border: ${borderWidth.DEFAULT};
  --boo-border-thick: ${borderWidth.thick};
  --boo-font: ${fontFamily};
}

@theme inline {
${colorTokens()}

${shadowTokens()}

${radiusTokens()}

  --font-boo: ${fontFamily};
}
`

const target = fileURLToPath(new URL('../src/design/tokens.css', import.meta.url))
writeFileSync(target, css)
console.info(`[boo-tokens] ${target} diperbarui.`)
