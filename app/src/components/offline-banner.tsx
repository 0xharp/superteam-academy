"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const t = useTranslations("common");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function goOffline() { setOffline(true); }
    function goOnline() { setOffline(false); }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOffline(true);
    }

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-amber-600 px-4 py-1.5 text-xs font-medium text-white">
      <WifiOff className="h-3.5 w-3.5" />
      <span>{t("offlineMessage")}</span>
    </div>
  );
}
