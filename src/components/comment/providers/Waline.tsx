import { init, type WalineInstance } from '@waline/client';
import '@waline/client/style';
import '@/styles/components/waline.css';
import { useEffect, useRef } from 'react';
import { commentConfig } from '@/constants/site-config';

// Config is module-level static data parsed from YAML at build time - won't change at runtime
const config = commentConfig.waline;

export default function Waline() {
  const walineInstanceRef = useRef<WalineInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!config || !containerRef.current) return;

    // Initialize Waline: project defaults → user config → runtime overrides
    walineInstanceRef.current = init({
      // Project defaults
      requiredMeta: ['nick'],
      imageUploader: false,
      // User config from site.yaml (spreads all fields including emoji, pageview, etc.)
      ...config,
      // Runtime overrides (must not be overridden by user config)
      el: containerRef.current,
      path: window.location.pathname,
      lang: config.lang ?? 'zh-CN',
      dark: config.dark ?? 'html.dark',
    });

    // Handle Astro page transitions - update path when navigating
    const handlePageLoad = () => {
      walineInstanceRef.current?.update({ path: window.location.pathname });
    };
    document.addEventListener('astro:page-load', handlePageLoad);

    return () => {
      walineInstanceRef.current?.destroy();
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, []);

  if (!config) return null;

  return <div ref={containerRef} />;
}
