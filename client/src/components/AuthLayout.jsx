import { PulseIcon } from '@phosphor-icons/react';
import Slideshow from './Slideshow';
import BrandLogo from './BrandLogo';
import BuiltBy from './BuiltBy';

/** Rows fade up in sequence on mount; `--i` is the stagger index read by CSS. */
export const step = (i) => ({ '--i': i });

/** The two-column auth shell: form on the left, illustration carousel right. */
export default function AuthLayout({ eyebrow, title, sub, children, tagline }) {
  return (
    <div className="auth">
      <section className="auth-panel">
        <div className="auth-inner">
          <span className="auth-brand" style={step(0)}>
            <BrandLogo />
            <span className="brand-name">UPTIME_MONITOR</span>
          </span>

          <p className="eyebrow auth-eyebrow" style={step(1)}>{eyebrow}</p>
          <h1 className="display auth-title" style={step(2)}>{title}</h1>
          <p className="auth-sub" style={step(3)}>{sub}</p>

          {children}

          <div className="auth-credit" style={step(12)}>
            <BuiltBy />
          </div>
        </div>
      </section>

      {/* The accent is an inset rounded box, not a full-bleed column — the
          canvas shows through on all four sides as a margin. */}
      <aside className="auth-art" aria-hidden="true">
        <div className="art-box">
          <Slideshow />
          <div className="art-foot">
            <p className="art-tagline display">{tagline}</p>
            <p className="art-note">
              <PulseIcon size={14} weight="bold" />
              Always watching. Instantly loud when it breaks.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
