import { GITHUB_URL } from '../config';

/** Compact developer credit — Anton name, muted label, yellow underline. */
export default function BuiltBy({ className = '' }) {
  return (
    <p className={`built-by ${className}`.trim()}>
      Built by{' '}
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="built-by-name"
      >
        CH VISHWAS RAO
      </a>
    </p>
  );
}
