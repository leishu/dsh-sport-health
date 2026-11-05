/**
 * Palette and Element Plus theme registration.
 *
 * Element Plus ships a light theme only, and the Harness shell can be light or
 * dark. Instead of shipping two stylesheets we expose the same CSS variables
 * Element Plus uses on `:root` and swap them between the two themes, driven by
 * `[data-theme="dark"]` on a wrapper element or by `prefers-color-scheme`.
 */

export const C = {
  accent: '#4f8cff',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#a855f7',
  cyan: '#06b6d4',
  pink: '#ec4899',
  slate: '#94a3b8',
} as const

export const PALETTE = [C.accent, C.green, C.amber, C.purple, C.cyan, C.pink, C.red, C.slate]

export const RISK_TONE: Record<string, string> = {
  HIGH_RISK: C.red, MODERATE_RISK: C.amber, LOW_RISK: C.green,
  HIGH: C.red, MODERATE: C.amber, LOW: C.green,
}

export const RISK_TEXT: Record<string, string> = {
  HIGH_RISK: '高风险', MODERATE_RISK: '中等风险', LOW_RISK: '低风险',
  // 服务端也可能回不带 `_RISK` 后缀的值；`RISK_TONE` 已经两种都认，
  // 文案这边不补齐就会在标签上漏出英文枚举。
  HIGH: '高风险', MODERATE: '中等风险', LOW: '低风险',
}

export const TYPE_TONE: Record<string, string> = {
  EASY: C.green, TEMPO: C.amber, INTERVAL: C.red, LONG: C.purple,
  RECOVERY: C.cyan, RACE: C.pink,
}

/** Maps a semantic tone to an Element Plus tag type. */
export function tagType(tone: string | undefined): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (tone) {
    case C.green: return 'success'
    case C.amber: return 'warning'
    case C.red: return 'danger'
    case C.accent: return 'primary'
    default: return 'info'
  }
}

export const VARS = {
  light: {
    '--el-color-primary': C.accent,
    '--el-color-primary-light-3': '#82aaff',
    '--el-color-primary-light-5': '#a5c2ff',
    '--el-color-primary-light-7': '#c8d9ff',
    '--el-color-primary-light-8': '#dae5ff',
    '--el-color-primary-light-9': '#edf3ff',
    '--el-color-primary-dark-2': '#3f70cc',
    '--el-bg-color': '#ffffff',
    '--el-bg-color-page': '#f5f6f8',
    '--el-bg-color-overlay': '#ffffff',
    '--el-text-color-primary': '#1b1d22',
    '--el-text-color-regular': '#3d4149',
    '--el-text-color-secondary': '#6b7280',
    '--el-text-color-placeholder': '#9aa1ab',
    '--el-border-color': 'rgba(15,23,42,0.14)',
    '--el-border-color-light': 'rgba(15,23,42,0.10)',
    '--el-border-color-lighter': 'rgba(15,23,42,0.07)',
    '--el-border-color-extra-light': 'rgba(15,23,42,0.05)',
    '--el-fill-color': 'rgba(15,23,42,0.05)',
    '--el-fill-color-light': 'rgba(15,23,42,0.035)',
    '--el-fill-color-lighter': 'rgba(15,23,42,0.025)',
    '--el-fill-color-blank': '#ffffff',
    '--el-mask-color': 'rgba(255,255,255,0.9)',
    '--sh-surface': 'rgba(15,23,42,0.028)',
    '--sh-surface-strong': 'rgba(15,23,42,0.05)',
    '--sh-border': 'rgba(15,23,42,0.12)',
    '--sh-line': 'rgba(15,23,42,0.09)',
    '--sh-muted': 'rgba(61,65,73,0.92)',
    '--sh-faint': 'rgba(107,114,128,0.92)',
  },
  dark: {
    '--el-color-primary': C.accent,
    '--el-color-primary-light-3': '#6ea2ff',
    '--el-color-primary-light-5': '#3b6ad6',
    '--el-color-primary-light-7': '#2c4f9e',
    '--el-color-primary-light-8': '#243f7c',
    '--el-color-primary-light-9': 'rgba(79,140,255,0.14)',
    '--el-color-primary-dark-2': '#7aa8ff',
    '--el-bg-color': '#1b1d22',
    '--el-bg-color-page': '#131417',
    '--el-bg-color-overlay': '#22252b',
    '--el-text-color-primary': '#e8e9ed',
    '--el-text-color-regular': '#c9ccd4',
    '--el-text-color-secondary': '#9aa1ab',
    '--el-text-color-placeholder': '#767d88',
    '--el-border-color': 'rgba(255,255,255,0.18)',
    '--el-border-color-light': 'rgba(255,255,255,0.13)',
    '--el-border-color-lighter': 'rgba(255,255,255,0.10)',
    '--el-border-color-extra-light': 'rgba(255,255,255,0.07)',
    '--el-fill-color': 'rgba(255,255,255,0.08)',
    '--el-fill-color-light': 'rgba(255,255,255,0.055)',
    '--el-fill-color-lighter': 'rgba(255,255,255,0.035)',
    '--el-fill-color-blank': '#1b1d22',
    '--el-mask-color': 'rgba(19,20,23,0.9)',
    '--sh-surface': 'rgba(255,255,255,0.035)',
    '--sh-surface-strong': 'rgba(255,255,255,0.06)',
    '--sh-border': 'rgba(255,255,255,0.14)',
    '--sh-line': 'rgba(255,255,255,0.10)',
    '--sh-muted': 'rgba(201,204,212,0.94)',
    '--sh-faint': 'rgba(154,161,171,0.9)',
  },
} as const

export type ThemeMode = 'light' | 'dark'

let injected = false

function declare(selector: string, vars: Record<string, string>): string {
  return `${selector}{${Object.entries(vars).map(([key, value]) => `${key}:${value};`).join('')}}`
}

function stylesheet(): string {
  return [
    declare(':root, [data-theme="light"]', VARS.light),
    declare('[data-theme="dark"]', VARS.dark),
    `@media (prefers-color-scheme: dark){${declare(':root:not([data-theme="light"])', VARS.dark)}}`,
  ].join('\n')
}

/** Injects the theme variables once per document. */
export function ensureThemeVars(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const style = document.createElement('style')
  style.setAttribute('data-sport-health', 'theme')
  style.textContent = stylesheet() + '\n' + overlayFixes()
  document.head.appendChild(style)
}

/** Element Plus positions popovers on `body`, outside our themed wrapper. */
function overlayFixes(): string {
  return `
.el-popper.is-light .el-popper__arrow::before{background:var(--el-bg-color-overlay);border-color:var(--el-border-color-light)}
.el-overlay{background:rgba(15,23,42,0.45)}
.sh-chart{position:relative;width:100%}
.sh-chart__empty{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:var(--sh-faint)}
.sh-card.el-card{border-radius:12px;border:1px solid var(--sh-border);background:var(--sh-surface);box-shadow:none;color:inherit}
.sh-card.el-card>.el-card__body{padding:14px}
.sh-card.el-card.is-never-shadow{border:1px solid var(--sh-border)}
.sh-kpi{padding:10px 12px;border-radius:10px;background:var(--sh-surface-strong);border:1px solid var(--sh-line);min-width:0}
.sh-kpi__label{font-size:11px;color:var(--sh-faint);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-kpi__row{display:flex;align-items:baseline;gap:4px;min-width:0}
.sh-kpi__value{font-weight:650;line-height:1.15;overflow-wrap:anywhere}
.sh-kpi__value.is-dense{font-size:14.5px}
.sh-kpi__unit{font-size:11.5px;color:var(--sh-muted);white-space:nowrap}
.sh-kpi__hint{font-size:11px;color:var(--sh-faint);margin-top:4px}
.sh-grid{display:grid;gap:10px}
.sh-kpis{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(112px,1fr))}
.sh-note{font-size:12px;color:var(--sh-muted);line-height:1.55}
.sh-split{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.sh-divider{display:flex;align-items:center;gap:8px;margin-bottom:10px;min-width:0}
.sh-divider__title{font-size:13px;font-weight:600;letter-spacing:.1px}
.sh-divider__sub{font-size:11.5px;color:var(--sh-faint);margin-top:2px}
.sh-raw{margin-top:10px}
.sh-raw pre{margin:8px 0 0;padding:10px;max-height:260px;overflow:auto;font-size:11px;line-height:1.45;border-radius:8px;background:var(--sh-surface-strong);border:1px solid var(--sh-line);color:inherit}
.sh-barlist{display:grid;gap:8px}
.sh-barlist__row{display:grid;grid-template-columns:minmax(64px,30%) 1fr auto;gap:8px;align-items:center;font-size:12px}
.sh-barlist__label{color:var(--sh-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sh-barlist__track{height:8px;border-radius:999px;background:var(--sh-surface-strong);overflow:hidden}
.sh-barlist__fill{height:100%;border-radius:999px}
.sh-barlist__value{font-variant-numeric:tabular-nums;white-space:nowrap}
.sh-barlist__meta{color:var(--sh-faint);margin-left:5px}
.sh-space{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sh-header{display:flex;align-items:center;gap:9px;margin-bottom:12px;flex-wrap:wrap}
.sh-header__icon{width:28px;height:28px;border-radius:8px;flex-shrink:0;display:grid;place-items:center;font-size:15px;background:rgba(79,140,255,.12);border:1px solid rgba(79,140,255,.24)}
.sh-header__title{font-size:13.5px;font-weight:650;line-height:1.25}
.sh-header__sub{font-size:11.5px;color:var(--sh-faint);margin-top:2px}
.sh-header__right{margin-left:auto;flex-shrink:0}
.el-table{font-size:12px;--el-table-bg-color:transparent;--el-table-tr-bg-color:transparent;--el-table-header-bg-color:transparent;--el-table-border-color:var(--sh-line);--el-table-header-text-color:var(--sh-faint);--el-table-text-color:inherit;--el-table-row-hover-bg-color:var(--sh-surface-strong)}
.el-table th.el-table__cell{font-weight:500}
.el-tabs__header{margin-bottom:10px}
`
}
