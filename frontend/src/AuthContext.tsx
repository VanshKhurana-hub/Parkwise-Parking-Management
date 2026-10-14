import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, getAuthToken, setAuthToken } from "./api";
import type { AuthUser, UserRole } from "./types";

const USER_STORAGE_KEY = "parkwise-auth-user";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  role: UserRole;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoginModalOpen: boolean;
  openLoginModal: (trigger?: HTMLElement | null) => void;
  closeLoginModal: () => void;
  loginModalTriggerRef: React.MutableRefObject<HTMLElement | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getInitialUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getAuthToken);
  const [user, setUser] = useState<AuthUser | null>(getInitialUser);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const loginModalTriggerRef = useRef<HTMLElement | null>(null);

  // Validate session on mount if token is present
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    let active = true;
    void api.me().then(
      (profile) => {
        if (!active) return;
        setUser(profile);
        try {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
        } catch {
          // Ignore storage quota errors
        }
      },
      () => {
        if (!active) return;
        // Token expired or invalid
        setToken(null);
        setUser(null);
        setAuthToken(null);
        try {
          localStorage.removeItem(USER_STORAGE_KEY);
        } catch {
          // Ignore
        }
      },
    );

    return () => {
      active = false;
    };
  }, [token]);

  const openLoginModal = useCallback((trigger?: HTMLElement | null) => {
    loginModalTriggerRef.current = trigger ?? (document.activeElement as HTMLElement);
    setIsLoginModalOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    setIsLoginModalOpen(false);
    loginModalTriggerRef.current?.focus();
  }, []);

  // Keyboard shortcut: Alt + L to toggle Login Modal
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        setIsLoginModalOpen((open) => {
          if (!open) {
            loginModalTriggerRef.current = document.activeElement as HTMLElement;
            return true;
          }
          loginModalTriggerRef.current?.focus();
          return false;
        });
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.login({ username, password });
    setAuthToken(response.access_token);
    setToken(response.access_token);
    setUser(response.user);
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    } catch {
      // Ignore storage errors
    }
    setIsLoginModalOpen(false);
    loginModalTriggerRef.current?.focus();
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const role: UserRole = user?.role ?? "guest";
  const isAuthenticated = Boolean(user && token);

  const value = useMemo(
    () => ({
      user,
      token,
      role,
      isAuthenticated,
      login,
      logout,
      isLoginModalOpen,
      openLoginModal,
      closeLoginModal,
      loginModalTriggerRef,
    }),
    [
      user,
      token,
      role,
      isAuthenticated,
      login,
      logout,
      isLoginModalOpen,
      openLoginModal,
      closeLoginModal,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

