export enum HomeSiderType {
  /** @lintignore knip 无法追踪 .astro 模板中的枚举成员引用（HomeSider.astro 等） */
  HOME = 'home',
  /** @lintignore knip 无法追踪 .astro 模板中的枚举成员引用（post/[...slug].astro 等） */
  POST = 'post', //有目录
}

export enum HomeSiderSegmentType {
  INFO = 'info',
  DIRECTORY = 'directory',
  SERIES = 'series',
}
