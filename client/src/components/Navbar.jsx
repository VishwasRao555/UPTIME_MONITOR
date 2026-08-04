import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  PulseIcon, BookOpen, GithubLogo, Bell, BellSlash, BellRinging, SignOut,
} from '@phosphor-icons/react';
import { getHealth } from '../api/monitor.api';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { GITHUB_URL } from '../config';
import BrandLogo from './BrandLogo';

/** Polls /health so the navbar always reflects whether the API is reachable. */
function useApiHealth(intervalMs = 15000) {
  const [state, setState] = useState('checking'); // 'checking' | 'online' | 'offline'

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        await getHealth();
        if (alive) setState('online');
      } catch {
        if (alive) setState('offline');
      }
    };
    ping();
    const id = setInterval(ping, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);

  return state;
}

const HEALTH_LABEL = { checking: 'Connecting', online: 'API online', offline: 'API offline' };

/** Who is signed in, and the way out. */
function AccountMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  async function handleSignOut() {
    setLeaving(true);
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="account">
      <span className="account-chip" title={`${user.name} · ${user.email}`}>
        <span className="account-avatar" aria-hidden="true">{initials}</span>
        <span className="account-name">{user.name.split(' ')[0]}</span>
      </span>
      <button
        className="icon-link"
        onClick={handleSignOut}
        disabled={leaving}
        aria-label="Sign out"
        title="Sign out"
      >
        <SignOut size={19} weight="bold" className={leaving ? 'spinning' : ''} />
      </button>
    </div>
  );
}

function NotifButton() {
  const { supported, permission, enabled, toggle } = useNotifications();
  if (!supported) return null;

  const denied = permission === 'denied';
  const label = denied
    ? 'Notifications blocked in browser settings'
    : enabled
      ? 'Alerts on — click to mute'
      : 'Enable downtime alerts';

  return (
    <button
      className={`icon-link notif-toggle ${enabled ? 'on' : ''}`}
      onClick={toggle}
      disabled={denied}
      aria-label={label}
      title={label}
    >
      {denied ? <BellSlash size={19} weight="bold" />
        : enabled ? <BellRinging size={19} weight="fill" />
          : <Bell size={19} weight="bold" />}
      {enabled && <span className="notif-live-dot" aria-hidden="true" />}
    </button>
  );
}

export default function Navbar() {
  const health = useApiHealth();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand" aria-label="UPTIME_MONITOR — go to dashboard">
          <BrandLogo />
          <span className="brand-name">UPTIME_MONITOR</span>
        </Link>

        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            <PulseIcon size={15} weight="bold" /> Dashboard
          </NavLink>
          <NavLink to="/docs" className={({ isActive }) => (isActive ? 'active' : '')}>
            <BookOpen size={15} weight="bold" /> Docs
          </NavLink>
        </div>

        <div className="nav-right">
          <span className={`api-status ${health}`} title={HEALTH_LABEL[health]}>
            <span className="api-dot" />
            <span className="api-text">{HEALTH_LABEL[health]}</span>
          </span>
          <NotifButton />
          <a
            className="icon-link"
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="View source on GitHub"
            title="GitHub"
          >
            <GithubLogo size={20} weight="bold" />
          </a>
          <AccountMenu />
        </div>
      </div>
    </nav>
  );
}
