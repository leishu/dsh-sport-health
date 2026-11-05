/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}

declare module 'element-plus/es/locale/lang/zh-cn.mjs' {
  const locale: Record<string, unknown>
  export default locale
}
