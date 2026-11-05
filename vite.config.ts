/**
 * Vite build for the two halves of the plugin.
 *
 * The DSH browser module loader executes each client bundle as a CommonJS
 * factory and expects it to register itself on `window.__ModuleLoader__`, so
 * the client build is emitted as a UMD bundle whose `module.exports` is the
 * plugin module. Vue, Element Plus and ECharts are bundled in — the shell only
 * has to provide the Harness `slots` service.
 *
 * Styles: the Harness shell loads *only* the JS entry of a bundle, so a
 * sibling `client.css` would never be requested. Element Plus ships its CSS as
 * JS entries (`element-plus/es/.../style/css`) which the components import
 * themselves, but those imports end up in the extracted CSS asset. The
 * `inlineStyles` plugin therefore folds that asset into the bundle as a string
 * and injects it as a deduplicated `<style>` tag when the module loads.
 */
import { defineConfig, type Plugin, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const banner = `window.__ModuleLoader__.load({
  id: "dsh-sport-health",
  factory: (require) => {`

const STYLE_ID = 'dsh-sport-health'

/**
 * Appends the extracted CSS to the entry chunk and injects it at load time.
 *
 * The `data-plugin` / `data-plugin-css` attributes mirror the convention used
 * by other DSH bundles, and `querySelector` makes the injection idempotent even
 * if the module is evaluated twice.
 */
function inlineStyles(id: string): Plugin {
  return {
    name: 'dsh-inline-styles',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const css: string[] = []
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'asset' && fileName.endsWith('.css')) {
          css.push(String(file.source))
          delete bundle[fileName]
        }
      }
      if (!css.length) return

      const entry = Object.values(bundle).find(file => file.type === 'chunk' && file.isEntry)
      if (!entry || entry.type !== 'chunk') return

      const text = css.join('\n')
      // The stylesheet is embedded as a JSON string literal, so concatenation is safe.
      entry.code += `
;(function () {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css="${id}"]')) return
  var tag = document.createElement('style')
  tag.dataset.plugin = ${JSON.stringify(id)}
  tag.dataset.pluginCss = ${JSON.stringify(id)}
  tag.textContent = ${JSON.stringify(text)}
  document.head.appendChild(tag)
})();
`
    },
  }
}

/**
 * Hands the bundle body the `require` of the factory that wraps it.
 *
 * This is the bundle's only channel to the shell: `factory(require)` is called
 * during materialization with the live module table, and every module body runs
 * inside that call. By the time cordis calls `apply(ctx)` the closure is gone
 * (`ctx` only carries injected services), so the module body has to take what
 * it needs on the synchronous path — here, the shell's React instance.
 */
const REQUIRE_ALIAS = '__dsh_require__'

/** Wraps the emitted UMD bundle in the DSH factory registration. */
function dshModuleLoader(): Plugin {
  return {
    name: 'dsh-module-loader',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk' || !file.isEntry) continue
        file.code = `${banner}
  var module = { exports: {} };
  var exports = module.exports;
  var ${REQUIRE_ALIAS} = require;
${file.code}
  return module.exports;
  }
});
`
      }
    },
  }
}

const nodeExternal = ['node:fs', 'node:fs/promises', 'node:path', 'node:url', 'node:http', 'node:crypto']

export default defineConfig(({ mode }): UserConfig => {
  /**
   * Default `production`, so `process.env.NODE_ENV` is folded away by the UMD
   * bundle — the Harness shell does not provide a `process` global.
   */
  if (mode === 'host') {
    return {
      build: {
        outDir: 'lib',
        emptyOutDir: false,
        target: 'node20',
        sourcemap: true,
        minify: false,
        lib: { entry: 'src/host/index.ts', formats: ['es'], fileName: () => 'index.js' },
        rollupOptions: { external: nodeExternal },
      },
    }
  }

  return {
    mode: 'production',
    plugins: [vue(), inlineStyles(STYLE_ID), dshModuleLoader()],
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    build: {
      outDir: 'lib',
      emptyOutDir: false,
      target: ['chrome120', 'safari17'],
      sourcemap: true,
      minify: 'esbuild',
      cssCodeSplit: false,
      lib: {
        entry: 'src/client/index.ts',
        name: 'DshSportHealth',
        formats: ['umd'],
        fileName: () => 'client.js',
      },
      rollupOptions: {
        /**
         * `react` must stay a *runtime* require of the shell's factory, not a
         * bundled copy: the slot renderer compares element types against its own
         * React instance. Rollup only leaves it alone if the bare `require` call
         * is opaque, and the UMD wrapper would otherwise demand an ambient
         * `require` global (the shell has none) — so map it to the factory's
         * `require`, aliased above as `__dsh_require__`.
         */
        external: ['react'],
        output: { exports: 'named', globals: { react: REQUIRE_ALIAS } },
      },
    },
  }
})
