"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { initPostHog } from "@/lib/analytics/posthog";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics/events";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const prevStatus = useRef(status);

  // Initialize PostHog on mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Track page views
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
      path: pathname,
      search: searchParams.toString(),
    });
  }, [pathname, searchParams]);

  // Track sign-in when session transitions to authenticated
  useEffect(() => {
    if (prevStatus.current !== "authenticated" && status === "authenticated" && session?.user) {
      trackEvent(ANALYTICS_EVENTS.SIGN_IN, { provider: session.provider });
    }
    prevStatus.current = status;
  }, [status, session]);

  return <>{children}</>;
}
