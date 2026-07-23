# llm.md — astro-koharu 魔改仓库 AI 交接文档

> 本文档面向接手本仓库维护（尤其是上游同步）的 AI 助手。请完整阅读后再动手。
> 最后更新：2026-07-23（完成 v5.0.0 同步）

---

## 1. 项目身份

- **本仓库**：`Aionfatedio/astro-koharu`（origin）——重度魔改的个人博客
- **上游**：`https://github.com/cosZone/astro-koharu`（remote 名 `upstream`）
- 框架：Astro 6.4.8（Content Layer）+ React 19 + Tailwind CSS 4 + Nanostores + Motion（LazyMotion `m.` 按需加载）
- 包管理器：**pnpm 11.16.0**；`cms/` 是**独立子包**（自带 package.json / pnpm-lock.yaml / node_modules）
- 当前版本：**5.0.0**（package.json version 与上游已同步版本保持一致）
- 已同步至上游：**v5.0.0**（2026-07-23，提交 `mod v5.0.0`）

## 2. 铁律（违反 = 同步失败）

1. **硬编码中文，永不同步 i18n**。本地已删除 `src/i18n/`、`[lang]` 多语言路由、`useTranslation` hook。上游组件里的 `t('key')` 一律按上游 `src/i18n/translations/zh.ts` 的值硬编码为中文字符串（同步时先 `git show v<新版本>:src/i18n/translations/zh.ts` 取出参照表）。
2. **本地魔改优先**。冲突时先弄清本地改动的意图（见 §3 魔改总账），不确定就保本地。
3. **静态站点部署**，无服务端逻辑。不引入 adapter（上游文档也已转向纯静态 `dist/`）。需要服务端支持的安全方案倾向跳过。
4. 用户偏好**简洁方案**，避免过度复杂；交流用中文。
5. 动手前创建备份分支（`backup/pre-v<版本>-sync`），提交当前工作区。
6. 根 `pnpm-workspace.yaml` 只包含 `.`；CMS 通过自身 `cms/pnpm-workspace.yaml` 与 `pnpm --dir cms install` 独立安装。

## 3. 本地魔改总账（同步时必须逐项保护）

### 3.1 音乐 / 云端逐字歌词（最大的本地功能，上游没有）
- **构建时**（`predev`/`prebuild` 跑 `generate:media --target videos,music`）：
  - `src/scripts/lib/netease-api.ts` — 网易 weapi 加密客户端（AES×2+RSA），抓歌单/专辑/单曲 + YRC 逐字歌词转增强 LRC
  - `src/scripts/lib/cloud-lyrics-generator.ts` — 写 `public/music/cloud-lyrics/<server>/<songId>.lrc` + `index.json`；带 24h TTL + sourceKeys 比对跳过（源不变不触网）；失败回退旧 index 条目
  - `src/scripts/lib/site-config.ts` — 统一 site.yaml 读取
  - 主脚本 `generateMediaManifests.ts` 只是 CLI 编排，生成器拆在 `src/scripts/lib/`（comics / local-music / video-metadata）
- **运行时** `src/lib/cloud-lyrics.ts` — 加载 index.json，按 name+artist 规范化指纹匹配替换 Meting lrc；**指纹函数、sourceKey 构造、CloudLyricsIndexEntry 类型是脚本与运行时共享的单一来源，勿复制**
- `src/components/bgm/GlobalBGMPlayer.tsx` — resolve 流程按 URL 拆分以携带 sourceKey，`applyCloudLyrics` 注入云歌词；歌词索引与歌单解析并行加载
- `src/components/markdown/audio-player/PlayerPreview.tsx` — `normalizeMetingResourceUrl` + 支持 `/` 开头本地路径 fetch（云歌词必需）+ AbortController（上游）+ `playing` prop 透传
- `WordLrcRenderer.tsx` — 逐字卡拉 OK + 超宽行横向滚动：rAF 循环内零 reflow/零 DOM 查询（行切换/ResizeObserver 时才测量并缓存 span 数组与 metrics）；`playing=false` 钉住插值时钟
- `src/lib/meting.ts` 关键约束：
  - `getFromCache` **禁止读时写回**（写回会刷新 timestamp 使 24h TTL 失效，网易 CDN 签名直链几小时就过期，会导致"歌单在、放不出"）
  - `normalizeMetingResourceUrl` 把 `http://163.hyc.moe` 升级 https（防 CORS）
  - `setCache` 配额满时清空全部 `meting:*` 条目重试一次

### 3.2 布局 / 交互魔改
- `src/layouts/Layout.astro`：FloatingGroup 用 `<div transition:persist="floating-group">` 包装；`MobileDrawer` 多传 `artistProfile`；挂 `<SettingsPanel client:idle />`；**不挂** ImageLightbox
- `src/components/layout/FloatingGroup.tsx`：展开状态 localStorage 持久化（`floating-group-expanded`，**默认收起**）
- `src/components/layout/SearchDialog.tsx`：Escape **捕获阶段**拦截（防 Pagefind 先清空输入）、rAF 聚焦（非上游 setTimeout(150)）、滚动区用常量 `SEARCH_DIALOG_SCROLL_AREA_ID`（来自 `@lib/pagefind-search-session`）
- 搜索高亮 `src/lib/search-highlight.ts`：先清理后判断 `?q=` 参数 + popstate 监听（返回键正确清除/恢复高亮）
- 整卡点击 `src/lib/post-card-navigation.ts` + PostItemCard `data-post-card-href`（simple 模式）；ctrl/cmd/shift/中键开新上下文
- 首页头像包 `<a href="/about">`（HomeInfo.astro）

### 3.3 Markdown / 渲染魔改
- **灯箱用 PhotoSwipe**（`markdown.css` 有 `.koharu-pswp-*` 块）；上游的 React `ImageLightbox.tsx` 本地**不存在**，modal.ts 也没有 `'imageLightbox'` 类型和 `navigateImage`——同步时上游相关改动全部跳过
- `src/lib/markdown/remark-link-embed.ts`：`DEFAULT_FAVICON_SVG` 常量 + `onerror` fallback 模板（无 favicon 时显示全局图标）
- `src/styles/theme/markdown.css` 尾部本地块：PhotoSwipe 定制、`.iconify-inline`、`.artist-score` 徽章（含 tooltip 伪元素）——与上游 reader 字体预设 CSS **共存**；代码块字号用上游 em 基准（`inherit`/`0.875em`，配合阅读设置缩放），但保留本地 `--markdown-scrollbar-inline-offset` 与 `-webkit-overflow-scrolling`
- `src/styles/theme/markdown-mod.css` 是另一个本地魔改 CSS 文件（上游无此文件）
- 图片/视频增强：`src/lib/image-enhancer.ts` / `video-enhancer.ts`（Artplayer 5.4.0，直链 + 可选 protected URL 签名）
- FA Pro 已完全移除，仅 Iconify + 自定义 SVG
- `remark-iconify-inline.ts` 本地图标插件

### 3.4 页面级
- `/friends` 友链页**停用**：`friends.astro` 里 `<FriendsGrid>`/`<FriendRequestForm>`/`<Comment>` 已注释，渲染 `<FriendsRedirect client:load />`（提示 + 倒计时跳主页）。源组件保留完整——上游更新 FriendCard/FriendsGrid 等可以照常同步（DIRECT），但 friends.astro 的停用状态**不许动**
- `SummaryPanel.tsx`：`SOURCE_CONFIG` 硬编码中文标签（人工摘要/AI 摘要/摘要），不要上游的 `SOURCE_LABEL_KEYS` + TranslationKey 结构
- `AGENTS.md` 是本地 Codex 适配版（≈CLAUDE.md），保本地
- 设置中心 `src/components/settings/registry.ts`：上游的 `i18nKey: TranslationKey` 已改为 `label: string` 中文字面量；`SettingsPanelContent` 用 `item.label`/`option.label`；`LocalFontPicker` 顶部有 `const locale = 'zh-CN'` + `LOCAL_FONT_FAILURE_MESSAGES` 映射

### 3.5 已删除（上游还有，本地永不恢复）
`src/i18n/**`、`src/pages/[lang]/**`、`src/pages/_shared/utils.ts`、`src/components/bangumi/`、`src/components/markdown/ImageLightbox.tsx`、`src/hooks/useVideoPlayer.ts`、`src/hooks/useTranslation`、`src/content/blog/tools/astro-koharu-guide.md`（上游示例文章）、ICP 备案配置、`src/lib/crypto/index.ts` 桶（rehype 直接从 `../crypto/encrypt` 导入）

### 3.6 v5.0.0 架构同步要点
- Astro 6 Content Layer 使用 `src/content.config.ts` 与 `glob()` loader；文章公开地址统一来自 `data.link`，禁止恢复 `CollectionEntry.slug` 作为路由来源。
- `scripts/koharu migrate` 在构建前检查并把旧 `slug` 迁移为 `link`；迁移具备快照、原子写入、重复链接检测、符号链接拒绝和失败回滚。
- v5 CLI 的备份/恢复/更新状态机直接同步；本地删除所有语言分支与翻译分支，迁移配置仅保留 `site.enableSlugTransliteration`。
- `pnpm-workspace.yaml` 明确允许根依赖所需的构建脚本（esbuild、sharp、re2、onnxruntime-node 等），避免 pnpm 11 非交互安装中断。

## 4. 上游同步方法论（实测有效，照此执行）

**背景**：历史同步全是手工 squash（`mod vX.Y.Z` 单亲提交），**直接 `git merge` 会重放大量版本，绝对不可行**。

标准流程（净增量三方应用）：

```bash
# 0. 准备
git add -A && git commit           # 清空工作区
git branch backup/pre-v<新>-sync   # 备份分支
git fetch upstream --tags --force

# 1. 生成三类清单
git diff --name-status v<旧> v<新>                    # 上游变更（A/M/D）
git diff --name-only v<旧> main                       # 本地魔改集（含删除）
# 交集 = MERGE 候选；上游变更-交集 = DIRECT；再从两者剔出 SKIP

# SKIP 固定项：src/i18n/**、[lang]、bangumi、docs/README.{en,ja}.md、
#   pnpm-lock.yaml、cms/pnpm-lock.yaml、本地已删文件（§3.5）
# 注意：MERGE 候选中"本地不存在"的文件必须剔除，否则 git apply 整体失败（全有或全无）

# 2. DIRECT：本地未动的文件直接取上游
git checkout v<新> -- <files...>   # 上游 D（删除）的文件改用 git rm

# 3. MERGE：三方应用 + 逐冲突解决
git diff v<旧> v<新> -- <merge-files...> > merge.patch
git apply --3way merge.patch       # 干净块自动进，冲突留 <<<<<<< 标记

# 4. 中文化：对所有含 t()/useTranslation 的文件（含 DIRECT 新文件）
git show v<新>:src/i18n/translations/zh.ts > /tmp/zh.ts   # 中文参照表
# 无参 t('key') → 'zh 值'；带参 t('key', {x}) → 手工模板字符串
# 最后全局验证：grep -rn "useTranslation" src cms/src 必须为 0

# 5. 依赖：根目录 pnpm install；CMS 用 pnpm --dir cms install

# 6. 验证（全绿才算完）：pnpm lint:fix → pnpm check → pnpm knip → pnpm build
#    + §6 魔改点回归抽查

# 7. package.json version 改为上游版本号；提交信息 "mod v<新>"；更新本文档
```

**冲突裁决原则**：
- 上游 `@deprecated` 回加 vs 本地已删 → **保本地删除**（本地做过 knip 死代码清理，比上游激进），但必须确认 DIRECT 取入的新文件没有引用这些旧名字
- 上游函数签名新增 `locale` 参数 → 属 i18n，保本地无参版本
- `motion.div → m.div` / `LazyMotionProvider` 包装 → 取上游（结构性迁移）
- 文件级判断：若本地改动**只有**中文硬编码 → 整取上游 + 转中文更干净；若有行为魔改（见 §3）→ 外科式逐冲突

## 5. 提交与版本惯例

- 提交信息：`mod v<上游版本号>`（同步提交）；日常改动无严格格式，中文描述
- `package.json` version 跟随上游版本
- 有 husky + lint-staged（提交时自动 biome + lint-md），提交可能耗时
- 换行：仓库 LF，Windows 工作区会警告 CRLF——正常，忽略

## 6. 已知坑（上次同步实战踩过，下次必查）

1. **package.json 依赖重排陷阱**：上游按字母重排依赖时，3way 会"删除侧干净应用 + 新增侧冲突"，按保本地解冲突会**静默丢依赖**。解决 package.json 冲突后必须核对依赖完整性（对照 `git show v<新>:package.json` 和上游实际 import）。
2. **上游会复用本地已删的"死代码"**：v4.2.1 的 settings 复用了本地 knip 清理删掉的 `react-hook-form`/`zod`/`@hookform/resolvers`/`microReboundPreset`（均已恢复）。`pnpm check` 报 Cannot find 时先想想是不是这种情况，从 git 历史或上游恢复。
3. **zod 必须 `^3.x`**：上游 `NumberField.tsx` 按 zod 3 API 写，装 zod 4 会炸。
4. **冲突体内嵌 `=======`**：自写脚本解析冲突标记时，冲突体本身可能含 `=======`（CSS 注释分隔线等），正则会错切导致文件截断。解决后必须 `grep -c "^<<<<<<<\|^=======\|^>>>>>>>"` 全库复查 + biome parse 检查。
5. **JS 正则 `^` 在 multiline 下匹配 `\r` 之后**：处理 CRLF 文件时 `^\s*xxx` 会吞掉前一行的 `\n` 留下孤立 `\r`（行合并）。行首匹配用 `^[ \t]*` 不要 `^\s*`；处理后用 `perl -ne 'print if /\r[^\n]/'` 复查。
6. **knip 误报 `src/layouts/PageLayout.astro`**：它被 `about.md`/`music.md` 的 frontmatter `layout:` 字符串引用，knip 和不含 `*.md` 的 grep 都看不见（已在 knip.json ignore）。**删任何"死文件"前必须 `grep --include="*.md"` 并跑 `pnpm build` 验证**。
7. **cms 是独立子包**：根 knip 已 ignore `cms/**`；cms 依赖声明在 `cms/package.json`，不要往根 package.json 塞 cms 专用依赖。
8. `git apply --3way` 是全有或全无：patch 里任何一个文件本地不存在就整体失败，先剔除再应用。
9. Windows 下 GNU tar 的列表输出带 CRLF，归档条目解析必须使用 `split(/\\r?\\n/)`，否则 manifest 会被误判为缺失或重复。
10. pnpm 11 非交互安装会阻止依赖构建脚本；根项目通过 `allowBuilds` 明确白名单，CMS 仍保持独立安装。

## 7. 验证清单（同步完成的定义）

```plain
[ ] pnpm lint:fix / pnpm lint     全绿
[ ] pnpm check                    0 errors
[ ] pnpm knip                     退出码 0
[ ] pnpm build                    24 页构建成功
[ ] grep -rn "useTranslation" src cms/src        = 0
[ ] grep -rn "^<<<<<<<" 全库                      = 0
[ ] 魔改点抽查：
    [ ] grep DEFAULT_FAVICON_SVG src/lib/markdown/remark-link-embed.ts
    [ ] grep applyCloudLyrics src/components/bgm/GlobalBGMPlayer.tsx
    [ ] friends.astro 仍是停用状态（FriendsRedirect）
    [ ] Layout.astro 有 transition:persist + artistProfile，无 ImageLightbox
    [ ] markdown.css 同时有 .koharu-pswp-* 和 data-font-preset 规则
[ ] pnpm dev 实际过一遍：BGM 播放器逐字歌词、设置面板（右下角悬浮组展开后的齿轮）、搜索高亮
```

## 8. 关键文件地图

| 域 | 路径 |
|---|---|
| 站点配置 | `config/site.yaml`（改后需重启 dev） |
| 配置类型 | `src/lib/config/types.ts` |
| 内容缓存/分类 | `src/lib/content/cache.ts`、`category-path.ts`（防循环依赖） |
| Meting/云歌词 | `src/lib/meting.ts`、`src/lib/cloud-lyrics.ts` |
| 构建脚本 | `src/scripts/generateMediaManifests.ts` + `src/scripts/lib/*` |
| 内容增强 | `src/components/common/CustomContent.astro`、`src/lib/{image,video}-enhancer.ts` |
| Markdown | `src/lib/markdown/shoka-renderers.ts`、`remark-link-embed.ts`、`remark-iconify-inline.ts` |
| 魔改 CSS | `src/styles/theme/markdown.css`（尾部本地块）、`markdown-mod.css` |
| 设置中心 | `src/components/settings/*`、`src/store/settings.ts`、`modal.ts` |
| koharu CLI | `scripts/koharu/`（TUI：backup/restore/update/generate/clean） |
| CMS 子包 | `cms/`（独立 package.json，编辑器，与前台无关） |

## 9. 历史同步记录摘要

| 上游版本 | 要点 |
|---|---|
| v3.2.5 | 图片系统增强；灯箱决定保留 PhotoSwipe（上游转 React ImageLightbox 未跟进） |
| v3.3.1 | TOC 高亮闪烁修复、Meting API 可配置端点 |
| v4.1.0 | link-embed 配置透传；BREAKING: previewCacheTime 秒→天；跳过 react-grab 移除 |
| v4.2.1 | 设置中心（中文化）、LazyMotion 迁移、Tweet 加固（取代本地 normalizeTweet 补丁）、代码块折叠、CMS 拆分+undici；恢复 zod3/react-hook-form 等 |
| v5.0.0 | Astro 6.4.8 Content Layer、link 迁移 CLI、备份/恢复安全快照、Spoiler fallback、Twikoo 加载状态、Mermaid 集成升级；保留本地云歌词、PhotoSwipe、艺术家与停用友链等魔改 |

## 10. 其他背景

- Twitter/X 嵌入式时间轴已被平台官方弃用（tfw_legacy_timeline_sunset），不可用；单条 Tweet 嵌入走 react-tweet + sourceUrl 回退
- 评论系统支持 remark42/giscus/waline/twikoo
- localStorage meting 缓存 24h TTL；OG 缓存分级 TTL（成功 30 天/失败 1 天），`.cache/og-data.json` 跟随提交
- knip 配置豁免：`public/**`、`cms/**`、`src/components/ui/**`（shadcn 兜底件）、`design-tokens.ts`（令牌参考）、`PageLayout.astro`（md frontmatter 引用）、`@iconify-json/*`、`ffprobe-static`
- 备份分支 `backup/pre-v5.0.0-sync` 尚在，确认稳定后可删
