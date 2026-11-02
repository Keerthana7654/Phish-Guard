import { createContext, useContext, useState, useCallback } from "react";
import { authApi } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("phishguard_user");
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    const { accessToken, email: userEmail, fullName, role } = res.data;
    localStorage.setItem("phishguard_token", accessToken);
    const userObj = { email: userEmail, fullName, role };
    localStorage.setItem("phishguard_user", JSON.stringify(userObj));
    setUser(userObj);
    return userObj;
  }, []);

  const register = useCallback(async (email, password, fullName) => {
    const res = await authApi.register(email, password, fullName);
    const { accessToken, email: userEmail, fullName: name, role } = res.data;
    localStorage.setItem("phishguard_token", accessToken);
    const userObj = { email: userEmail, fullName: name, role };
    localStorage.setItem("phishguard_user", JSON.stringify(userObj));
    setUser(userObj);
    return userObj;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("phishguard_token");
    localStorage.removeItem("phishguard_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAdmin: user?.role === "ROLE_ADMIN" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
