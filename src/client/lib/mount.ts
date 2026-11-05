/**
 * 桥接层：Harness 的 React 插槽 ⇄ Vue 组件。
 *
 * DSH 的 slot 渲染器是按 **React 元素**挂载条目的（renderer 里 `renderEntry()`
 * 就是 `jsx(Comp, {...kit, ...ownerProps})`），所以注册进去的必须是一个
 * React 组件，并且 **返回 React 元素**。直接把 Vue 实例或它生成的 DOM 节点抛给
 * React，会触发 `Objects are not valid as a React child`（Minified React
 * error #31），SlotErrorBoundary 把整个条目降级成空锚点 —— 表现就是页面空白。
 *
 * 桥接方式：
 *   1. 包装组件返回一个普通的 React `<div>`，React 只负责这个空容器的生命周期；
 *   2. 在 `useEffect` 里对容器执行 `createApp(...).mount(container)`，容器内部
 *      完全交给 Vue（连同 Element Plus / ECharts 的自有 DOM 与事件）；
 *   3. 卸载时 `app.unmount()`，不留孤儿实例。
 *
 * React 不打包：从宿主 bundle 工厂的 `require('react')` 取同一份实例，元素类型
 * 才能被渲染器正确识别。owner props 写进一个 reactive 对象，Vue 侧响应式更新，
 * 不重新挂载。
 */
import { createApp, h, reactive, type App, type Component } from 'vue'
import { ElConfigProvider } from 'element-plus/es/components/config-provider/index.mjs'
import 'element-plus/es/components/config-provider/style/css.mjs'
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'
import { ensureThemeVars } from '../lib/theme.ts'

/** 桥接层实际用到的那部分 React API。 */
export interface ReactRuntime {
  createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown
  useRef<T>(initial: T): { current: T }
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
}

/** bundle 工厂拿到的模块加载器。 */
type Require = (specifier: string) => unknown

/**
 * 包装器注入的 require（见 `vite.config.ts` 的 `moduleLoader()`）。
 *
 * 它不是全局变量：`var __dsh_require__ = require` 写在工厂体里，本模块的代码
 * 也在工厂体里，所以直接引用即可。`typeof` 守卫是给 ts / 单测环境兜底的 ——
 * 那里没有这个标识符，`typeof` 对未声明变量不会抛错。
 */
declare const __dsh_require__: Require | undefined

let reactRuntime: ReactRuntime | null = null
let reactError: Error | null = null

/**
 * 在 **bundle 工厂执行期间** 捕获宿主的 React。
 *
 * 时机很关键：shell 的 client-modules 用 `factory(require)` 物化 bundle，
 * 那个 `require` 是 `makeRequire(ownerId, edges)` 造出来的闭包 —— 只在物化
 * 过程中有效。之后 (`apply()` 由 Cordis 调用) 再想拿，已经没有入口了：
 * `ctx` 不会注入 `require`，`internal.import()` 也只返回模块 exports。
 *
 * 所以由 `index.ts` 的工厂体在模块顶层调用本函数，把 React 存进模块作用域。
 * 模块体只分两步执行：先工厂（捕获 React），后 `apply`（注册插槽），顺序天然
 * 成立。
 */
export function captureHostReact(require: Require | undefined): void {
  if (typeof require !== 'function') {
    reactError = new Error('dsh-sport-health: bundle factory received no require()')
    return
  }
  try {
    const mod = require('react') as ReactRuntime | undefined
    if (mod && typeof mod.createElement === 'function') {
      reactRuntime = mod
      reactError = null
      return
    }
    reactError = new Error('dsh-sport-health: require("react") returned no usable runtime')
  } catch (error) {
    reactError = error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * 从包装器注入的 `__dsh_require__` 捕获宿主 React。
 *
 * 由 `index.ts` 在模块顶层调用 —— 也就是工厂体执行期间，唯一能拿到 require
 * 的时机。
 */
export function captureShellReact(): void {
  captureHostReact(typeof __dsh_require__ === 'function' ? __dsh_require__ : undefined)
}

/**
 * 取宿主的 React 实例。
 *
 * 必须和渲染器用同一份：React 会按实例做元素类型判定与 hooks 分配，两个副本
 * 混用会在 hooks 上直接炸掉。
 */
export function resolveReact(): ReactRuntime {
  if (reactRuntime) return reactRuntime
  const global = (globalThis as { React?: ReactRuntime }).React
  if (global && typeof global.createElement === 'function') return global
  throw reactError ?? new Error('dsh-sport-health: the Harness shell did not provide a React runtime')
}

/**
 * 把 Vue 组件包装成 React 组件，供 `slots.register()` 使用。
 *
 * 每次 React 渲染都会调用返回的函数，但 Vue app 只在挂载时创建一次
 * （`useEffect` 空依赖），后续 props 变化只写 reactive 对象。
 */
export function createSlotComponent<Props extends Record<string, unknown>>(
  component: Component,
  initial: Partial<Props> = {},
) {
  return function SlotComponent(props: Record<string, unknown> = {}) {
    const React = resolveReact()

    // 桥接容器：由 React 创建并持有，内部归 Vue 管。
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const propsRef = React.useRef<Record<string, unknown> | null>(null)
    if (propsRef.current === null) propsRef.current = reactive<Record<string, unknown>>({ ...initial })

    React.useEffect(() => {
      const container = containerRef.current
      if (!container) return

      ensureThemeVars()

      const app: App = createApp({
        render: () => h(
          ElConfigProvider as unknown as Component,
          { locale: zhCn },
          () => h(component as Component, { ...propsRef.current }),
        ),
      })
      app.mount(container)

      return () => {
        app.unmount()
      }
    }, [])

    // owner props 每次 React 渲染都会来（工具阶段 start → result、切换会话），
    // 在渲染期写入，Vue 侧下一帧即生效，避免多跑一轮 React 更新。
    Object.assign(propsRef.current, props)

    return React.createElement('div', {
      ref: containerRef,
      // 不参与外层布局：grid/flex 父级看到的是 Vue 自己的子节点，而非这层壳。
      style: { display: 'contents' },
    })
  }
}
