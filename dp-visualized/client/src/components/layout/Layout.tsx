import { NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-line bg-panel px-5 py-2.5">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-end justify-center gap-[2px] rounded bg-accent/15 p-[3px]">
            <span className="w-[4px] rounded-sm bg-slate-500" style={{ height: "40%" }} />
            <span className="w-[4px] rounded-sm bg-known" style={{ height: "70%" }} />
            <span className="w-[4px] rounded-sm bg-accent" style={{ height: "100%" }} />
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-white">dp·visualized</span>
        </NavLink>
        <nav className="ml-auto flex items-center gap-1 font-mono text-xs">
          {[
            { to: "/", label: "Home" },
            { to: "/patterns", label: "Patterns" },
            { to: "/about", label: "About" },
          ].map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 transition-colors ${isActive ? "bg-accent/15 text-accent" : "text-slate-400 hover:text-white"}`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <a
            href="https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-sheet/"
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-1.5 text-slate-400 transition-colors hover:text-white"
          >
            A2Z Sheet ↗
          </a>
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
