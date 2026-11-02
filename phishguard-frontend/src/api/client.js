import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8009";

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("phishguard_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem("phishguard_token");
      localStorage.removeItem("phishguard_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email, password) => api.post("/api/auth/login", { email, password }),
  register: (email, password, fullName) =>
    api.post("/api/auth/register", { email, password, fullName }),
};

export const urlApi = {
  analyze: (url) => api.post("/api/url/analyze", { url }),
};

export const historyApi = {
  getMine: (page = 0, size = 20) => api.get(`/api/history?page=${page}&size=${size}`),
};

export const adminApi = {
  getStats: () => api.get("/api/admin/stats"),
  getAllHistory: (page = 0, size = 20) => api.get(`/api/admin/history?page=${page}&size=${size}`),
};

export default api;
