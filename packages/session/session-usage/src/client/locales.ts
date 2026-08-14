/** Locale namespace owned by the Usage Statistics settings section. */

export const NS = 'session-usage'

/** Simplified-Chinese Usage Statistics strings. */
export const zh = {
  nav: '使用统计',
  title: '使用统计',
  subtitle: '按时间查看 token 用量与模型请求统计',
  'presets.7d': '近 7 天',
  'presets.14d': '近 14 天',
  'presets.30d': '近一个月',
  'presets.custom': '自定义',
  totalTokens: '总 Tokens',
  input: '输入',
  output: '输出',
  cacheRead: '缓存读取',
  cacheWrite: '缓存写入',
  requests: '请求次数',
  sessions: '会话数',
  byDay: '按天用量',
  byTask: '按任务用量',
  task: '任务',
  date: '日期',
  total: '总计',
  noTitle: '（无标题）',
  loading: '统计中…',
  error: '查询失败',
  empty: '所选时间段内没有使用记录',
  search: '搜索任务…',
  refresh: '刷新',
  'footer.close': '关闭使用统计',
} as const

/** English Usage Statistics strings. */
export const en: Record<keyof typeof zh, string> = {
  nav: 'Usage',
  title: 'Usage Statistics',
  subtitle: 'Token usage and model request statistics over time',
  'presets.7d': 'Last 7 days',
  'presets.14d': 'Last 14 days',
  'presets.30d': 'Last month',
  'presets.custom': 'Custom',
  totalTokens: 'Total tokens',
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
  requests: 'Requests',
  sessions: 'Sessions',
  byDay: 'Daily usage',
  byTask: 'Usage by task',
  task: 'Task',
  date: 'Date',
  total: 'Total',
  noTitle: '(untitled)',
  loading: 'Loading…',
  error: 'Query failed',
  empty: 'No usage in the selected period',
  search: 'Search tasks…',
  refresh: 'Refresh',
  'footer.close': 'Close usage statistics',
}

/** Stable locale keys consumed by the Usage Statistics section. */
export type UsageKey = keyof typeof zh
