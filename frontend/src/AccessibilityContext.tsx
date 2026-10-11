import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type FontScale = 0 | 1 | 2 | 3;
interface AccessibilityState {
  fontScale: FontScale;
  highContrast: boolean;
  darkMode: boolean;
  changeFontScale: (delta: -1 | 1) => void;
  toggleHighContrast: () => void;
  toggleDarkMode: () => void;
}

const STORAGE_KEY = "parkwise-accessibility";
const fontSizes = ["87.5%", "100%", "112.5%", "125%"];
const AccessibilityContext = createContext<AccessibilityState | null>(null);

function initialSettings(): Pick<AccessibilityState, "fontScale" | "highContrast" | "darkMode"> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AccessibilityState>;
      return {
        fontScale: [0, 1, 2, 3].includes(parsed.fontScale as number)
          ? (parsed.fontScale as FontScale)
          : 1,
        highContrast: parsed.highContrast === true,
        darkMode: parsed.darkMode === true,
      };
    }
  } catch {
    return { fontScale: 1, highContrast: false, darkMode: false };
  }
  return { fontScale: 1, highContrast: false, darkMode: false };
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = fontSizes[settings.fontScale];
    root.classList.toggle("high-contrast", settings.highContrast);
    root.classList.toggle("dark-mode", settings.darkMode);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // The accessibility settings remain active for this visit if storage is unavailable.
    }
  }, [settings]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        setSettings((current) => ({ ...current, highContrast: !current.highContrast }));
      }
      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        setSettings((current) => ({ ...current, darkMode: !current.darkMode }));
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const changeFontScale = useCallback((delta: -1 | 1) => {
    setSettings((current) => ({
      ...current,
      fontScale: Math.max(0, Math.min(3, current.fontScale + delta)) as FontScale,
    }));
  }, []);
  const toggleHighContrast = useCallback(
    () => setSettings((current) => ({ ...current, highContrast: !current.highContrast })),
    [],
  );
  const toggleDarkMode = useCallback(
    () => setSettings((current) => ({ ...current, darkMode: !current.darkMode })),
    [],
  );

  const value = useMemo(
    () => ({ ...settings, changeFontScale, toggleHighContrast, toggleDarkMode }),
    [settings, changeFontScale, toggleHighContrast, toggleDarkMode],
  );
  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) throw new Error("useAccessibility must be used within AccessibilityProvider.");
  return context;
}
