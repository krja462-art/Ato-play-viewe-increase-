import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return false;
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://') ||
        window.location.search.includes('source=pwa') ||
        window.location.search.includes('utm_source=homescreen') ||
        localStorage.getItem('pwa_installed') === 'true';
      return isStandalone;
    } catch {
      return false;
    }
  });
  const [isIOS, setIsIOS] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem('pwa_install_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // 1. Check if app is running in standalone mode (installed PWA / WebAPK)
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://') ||
        window.location.search.includes('source=pwa') ||
        window.location.search.includes('utm_source=homescreen') ||
        localStorage.getItem('pwa_installed') === 'true';

      if (isStandalone) {
        setIsInstalled(true);
      }
    };

    checkStandalone();

    // 2. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(isIOSDevice);

    // 3. Listen for browser install prompt (Android, Chrome, Edge, Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try {
        localStorage.setItem('pwa_installed', 'true');
        localStorage.removeItem('pwa_install_dismissed');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        try {
          localStorage.setItem('pwa_installed', 'true');
        } catch {}
        return true;
      }
    } catch (err) {
      console.warn('PWA install error:', err);
    }
    return false;
  };

  const dismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('pwa_install_dismissed', 'true');
    } catch {}
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isDismissed,
    install,
    dismiss
  };
}
