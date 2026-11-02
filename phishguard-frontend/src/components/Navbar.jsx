import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FiShield, FiLogOut, FiGrid, FiClock, FiBarChart2 } from "react-icons/fi";

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="glass-card navbar">
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)" }}>
        <FiShield size={22} color="var(--accent)" />
        <strong>PhishGuard</strong>
      </Link>

      {user ? (
        <div className="nav-links">
          <Link to="/dashboard" className="nav-link" title="Dashboard">
            <FiGrid size={16} /> <span className="nav-label">Dashboard</span>
          </Link>
          <Link to="/history" className="nav-link" title="History">
            <FiClock size={16} /> <span className="nav-label">History</span>
          </Link>
          {isAdmin && (
            <Link to="/admin" className="nav-link" title="Admin">
              <FiBarChart2 size={16} /> <span className="nav-label">Admin</span>
            </Link>
          )}
          <span className="nav-user" style={{ fontSize: 13, color: "var(--muted)" }}>{user.fullName}</span>
          <button
            className="btn btn-secondary"
            title="Logout"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            <FiLogOut size={14} /> <span className="nav-label">Logout</span>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <Link to="/login" className="btn btn-secondary">Login</Link>
          <Link to="/register" className="btn btn-primary">Sign Up</Link>
        </div>
      )}
    </nav>
  );
}