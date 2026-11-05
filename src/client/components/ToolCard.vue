/**
 * Chart-first view for a single sport-health MCP tool call.
 *
 * The MCP bridge registers tools as `mcp__server__tool`; the payload is a
 * JSON document inside the text content of the tool result, so it is parsed
 * directly from the recorded block, with no extra host round-trip.
 */
<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElCollapse, ElCollapseItem, ElTag } from './element.ts'
import ThemeProvider from './ThemeProvider.vue'
import ToolViews from './ToolViews.vue'
import { C, tagType } from '../lib/theme.ts'
import { TITLES, ICONS, parsePayload, rawName, subtitleFor } from '../lib/payload.ts'

const props = withDefaults(defineProps<{
  toolName: string
  phase?: 'preparing' | 'start' | 'result'
  block?: any
}>(), { phase: 'start', block: undefined })

const name = computed(() => rawName(props.toolName ?? ''))
const title = computed(() => TITLES[name.value] ?? name.value)
const icon = computed(() => ICONS[name.value] ?? '📊')
const parsed = computed(() => (props.phase === 'result' ? parsePayload(props.block) : {}))
const payload = computed(() => parsed.value.value)
const failed = computed(() => Boolean(props.block?.isError))
const pending = computed(() => props.phase !== 'result')
/**
 * 失败态的判定要优先于 `payload`。
 *
 * 服务端报错时通常也会带回一个 JSON（`{"error": "..."}`），旧模板里
 * `v-else-if="payload === undefined"` 让失败分支排在前面还行，但下面
 * 「原始数据」折叠面板只看 `payload !== undefined`，于是失败态又多出一块
 * 看起来像正常结果的原始 JSON。这里统一成 `showViews`，失败时不出图表视图。
 */
const showViews = computed(() => !failed.value && payload.value !== undefined)
/**
 * 副标题只跟 payload 有关，不受失败态影响：失败时更需要知道是哪次跑步/哪个区间。
 */
const subtitle = computed(() => (payload.value === undefined ? undefined : subtitleFor(name.value, payload.value)))
const status = computed(() => ({
  text: failed.value ? '失败' : pending.value ? '调用中' : '完成',
  tone: failed.value ? C.red : pending.value ? C.amber : C.green,
}))
/** 折叠面板只在 `showViews` 时渲染，所以到这里 payload 必然是已解析的 JSON。 */
const raw = computed(() => JSON.stringify(payload.value, null, 2))
/**
 * 失败态的原始内容由告警正文承载。
 *
 * 失败时不渲染「原始数据」折叠面板 —— 那会让报错和正常结果长得一样；但错误
 * 原样仍是排查的唯一线索，所以能解析成 JSON 就格式化后放进 description
 * （`.el-alert__description` 已是 `white-space: pre-wrap`，换行不会被吞）。
 */
const failureText = computed(() => (payload.value === undefined
  ? rawText(parsed.value.text)
  : JSON.stringify(payload.value, null, 2)))

function rawText(text?: string): string {
  return text === undefined || text === '' ? '（无内容）' : text
}
</script>

<template>
  <ThemeProvider>
    <div class="sh-card sh-card--tool">
      <header class="sh-header">
        <div class="sh-header__icon">{{ icon }}</div>
        <div style="min-width: 0">
          <div class="sh-header__title">{{ title }}</div>
          <div v-if="subtitle" class="sh-header__sub">{{ subtitle }}</div>
        </div>
        <div class="sh-header__right">
          <ElTag :type="tagType(status.tone)" size="small" effect="light" round>{{ status.text }}</ElTag>
        </div>
      </header>

      <p v-if="pending" class="sh-note">正在等待 sport-health MCP 返回数据…</p>
      <ElAlert
        v-else-if="failed"
        type="error"
        :closable="false"
        show-icon
        title="工具调用失败"
        :description="failureText"
      />
      <ElAlert
        v-else-if="payload === undefined"
        type="warning"
        :closable="false"
        show-icon
        title="无法解析工具返回内容"
        :description="parsed.text || '返回内容不是 JSON'"
      />
      <ToolViews v-else :d="payload" :tool="name" />

      <ElCollapse v-if="showViews" class="sh-raw">
        <ElCollapseItem title="原始数据" name="raw">
          <pre>{{ raw }}</pre>
        </ElCollapseItem>
      </ElCollapse>
    </div>
  </ThemeProvider>
</template>

<style>
.sh-card--tool {
  padding: 14px;
  min-width: 0;
  border-radius: 12px;
  border: 1px solid var(--sh-border);
  background: var(--sh-surface);
  color: inherit;
}
.sh-card--tool .el-collapse {
  border: none;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
  --el-collapse-border-color: transparent;
  --el-collapse-header-text-color: var(--sh-faint);
  --el-collapse-header-font-size: 11.5px;
  --el-collapse-content-text-color: inherit;
}
.sh-card--tool .el-collapse-item__header {
  height: 26px;
  line-height: 26px;
  border-bottom: none;
}
.sh-card--tool .el-collapse-item__wrap { border-bottom: none; }
.sh-card--tool .el-collapse-item__content { padding-bottom: 0; }
.sh-card--tool .el-alert { padding: 10px 12px; }
.sh-card--tool .el-alert__description { white-space: pre-wrap; word-break: break-word; }
</style>
