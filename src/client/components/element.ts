/**
 * Single source of truth for the Element Plus components we use.
 *
 * Instead of registering every component globally (which defeats tree shaking)
 * the views import the concrete components from here, and this file also pulls
 * in each component's stylesheet once.
 */
import { ElAlert } from 'element-plus/es/components/alert/index.mjs'
import { ElBadge } from 'element-plus/es/components/badge/index.mjs'
import { ElButton } from 'element-plus/es/components/button/index.mjs'
import { ElCard } from 'element-plus/es/components/card/index.mjs'
import { ElCollapse, ElCollapseItem } from 'element-plus/es/components/collapse/index.mjs'
import { ElDescriptions, ElDescriptionsItem } from 'element-plus/es/components/descriptions/index.mjs'
import { ElDivider } from 'element-plus/es/components/divider/index.mjs'
import { ElEmpty } from 'element-plus/es/components/empty/index.mjs'
import { ElProgress } from 'element-plus/es/components/progress/index.mjs'
import { ElResult } from 'element-plus/es/components/result/index.mjs'
import { ElSkeleton, ElSkeletonItem } from 'element-plus/es/components/skeleton/index.mjs'
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs'
import { ElTabs, ElTabPane } from 'element-plus/es/components/tabs/index.mjs'
import { ElTag } from 'element-plus/es/components/tag/index.mjs'
import { ElTooltip } from 'element-plus/es/components/tooltip/index.mjs'

import 'element-plus/es/components/alert/style/css.mjs'
import 'element-plus/es/components/badge/style/css.mjs'
import 'element-plus/es/components/button/style/css.mjs'
import 'element-plus/es/components/card/style/css.mjs'
import 'element-plus/es/components/collapse/style/css.mjs'
import 'element-plus/es/components/descriptions/style/css.mjs'
import 'element-plus/es/components/divider/style/css.mjs'
import 'element-plus/es/components/empty/style/css.mjs'
import 'element-plus/es/components/progress/style/css.mjs'
import 'element-plus/es/components/result/style/css.mjs'
import 'element-plus/es/components/skeleton/style/css.mjs'
import 'element-plus/es/components/table/style/css.mjs'
import 'element-plus/es/components/tabs/style/css.mjs'
import 'element-plus/es/components/tag/style/css.mjs'
import 'element-plus/es/components/tooltip/style/css.mjs'

export {
  ElAlert, ElBadge, ElButton, ElCard, ElCollapse, ElCollapseItem,
  ElDescriptions, ElDescriptionsItem, ElDivider, ElEmpty, ElProgress,
  ElResult, ElSkeleton, ElSkeletonItem, ElTable, ElTableColumn, ElTabPane,
  ElTabs, ElTag, ElTooltip,
}
