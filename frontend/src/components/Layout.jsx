import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Wrench, LayoutGrid, User, Plus, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';

function NavItem({ to, icon: Icon, label, badge }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
          isActive
            ? 'bg-accent-muted text-accent'
            : 'text-text-muted hover:bg-surface-raised hover:text-text'
        }`
      }
    >
      <Icon size={16} />
      {label}
      {badge > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <NavLink to="/" className="flex items-center gap-2 text-text">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted text-accent">
                <Wrench size={16} />
              </span>
              <span className="text-base font-semibold tracking-tight">FixBoard</span>
            </NavLink>

            <nav className="flex items-center gap-1">
              <NavItem to="/" icon={LayoutGrid} label="Dashboard" />
              <NavItem to="/my-posts" icon={User} label="My Posts" badge={unreadCount} />
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/posts/new')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-accent/20 transition-colors duration-150 hover:bg-accent-hover"
            >
              <Plus size={16} />
              New Post
            </button>

            <div className="mx-1 h-6 w-px bg-border" />

            <ThemeToggle />

            <div className="flex items-center gap-2">
              <Avatar initials={user?.avatar_initials} size="sm" />
              <span className="hidden text-sm font-medium text-text sm:inline">
                {user?.name}
              </span>
            </div>

            <button
              onClick={handleLogout}
              title="Log out"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-raised hover:text-danger"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
