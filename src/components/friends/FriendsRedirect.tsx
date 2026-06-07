import { useEffect, useState } from 'react';

/** 自动返回主页的倒计时秒数 */
const REDIRECT_SECONDS = 5;
/** 主页路径 */
const HOME_PATH = '/';

/**
 * 友情链接功能暂时停用占位组件。
 *
 * 任何通过 URL 直接访问 /friends 的访问者会看到「当前暂不支持友情链接」提示，
 * 并在 {@link REDIRECT_SECONDS} 秒后自动重定向回主页；也可点击「返回主页」立即跳转。
 *
 * 倒计时用 setTimeout 链式递减驱动，useEffect 的 cleanup 会在组件卸载
 * （含 Astro view-transition 切走页面）时清除定时器，避免泄漏与误跳转。
 * 禁用 JS 的访问者不会自动跳转，但「返回主页」链接为静态渲染，仍可手动点击返回。
 */
export default function FriendsRedirect() {
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // 最后一秒结束时直接跳转，避免界面短暂闪现「0 秒」
      if (seconds <= 1) {
        window.location.href = HOME_PATH;
      } else {
        setSeconds((s) => s - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
      <h2 className="font-bold text-3xl text-gray-700 dark:text-gray-300">暂不支持友情链接</h2>
      <p className="text-gray-500 text-sm dark:text-gray-400">
        将在 {seconds} 秒后{' '}
        <a href={HOME_PATH} className="text-primary hover:underline">
          返回主页
        </a>
      </p>
    </div>
  );
}
