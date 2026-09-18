import { useEffect } from 'react';

export type Theme = 'light';

export function useTheme() {
  useEffect(() => {
    try {
      const root = document.documentElement;
      root.classList.remove('dark');
      localStorage.removeItem('app_theme');
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', '#2563eb');
      }
    } catch {}
  }, []);

  return {
    theme: 'light' as const,
    isDark: false,
    toggleTheme: () => {},
    setTheme: () => {}
  };
}

