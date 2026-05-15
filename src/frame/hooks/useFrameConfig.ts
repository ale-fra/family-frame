import * as React from "react";
import { defaultConfig, mergeConfig } from "@/lib/config";
import type { FrameConfig } from "@/lib/types";
import { fetchFrameSettings, subscribeFrameEvents } from "../api";

export function useFrameConfig() {
  const [config, setConfig] = React.useState<FrameConfig>(defaultConfig);

  React.useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch("/frame.config.json", { cache: "no-store" });
        const loadedConfig = response.ok ? await response.json() as Partial<FrameConfig> : defaultConfig;
        const settings = await fetchFrameSettings();
        if (!cancelled) setConfig(mergeConfig(loadedConfig, settings));
      } catch {
        if (!cancelled) setConfig(defaultConfig);
      }
    }

    loadConfig();
    const unsubscribe = subscribeFrameEvents((event) => {
      if (event.type === "settings") loadConfig();
    });
    const interval = window.setInterval(loadConfig, 60_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  return config;
}
