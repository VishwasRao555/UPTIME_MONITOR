import { PulseIcon } from '@phosphor-icons/react';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-brand">
          <PulseIcon size={15} weight="bold" /> Sentinel
        </span>
        <span className="footer-note">
          Self-hosted uptime monitoring · Debounced state machine · Zero runtime cost
        </span>
        <span className="footer-year">© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
