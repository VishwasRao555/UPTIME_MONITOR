import BrandLogo from './BrandLogo';
import BuiltBy from './BuiltBy';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-brand">
          <BrandLogo size={15} /> UPTIME_MONITOR
        </span>
        <span className="footer-note">
          Your sites. Our pulse. Zero drama until something dies.
        </span>
        <div className="footer-meta">
          <BuiltBy />
          <span className="footer-year">© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
