// src/components/Layout.tsx
import { Link, Outlet, useLocation } from "react-router-dom";

const Layout = () => {
  const location = useLocation();
  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/glossary", label: "Advantages" },
    { to: "/profile", label: "Profile" },
    { to: "/game", label: "Game" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ background: "#222", color: "#fff", padding: "1rem" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              style={{
                color: location.pathname === link.to ? "#ffd700" : "#fff",
                textDecoration: "none",
                fontWeight: location.pathname === link.to ? "bold" : "normal",
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Page Content */}
      <main style={{ flexGrow: 1, padding: "2rem" }}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer style={{ background: "#222", color: "#ccc", padding: "1rem", textAlign: "center" }}>
        <p>
          Advantage Chess © {new Date().getFullYear()} | Inspired by <a href="https://drawbackchess.com" style={{ color: "#fff" }}>Drawback Chess</a>
        </p>
      </footer>
    </div>
  );
};

export default Layout;
