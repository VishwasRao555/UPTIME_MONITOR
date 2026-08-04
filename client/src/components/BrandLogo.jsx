/** Shared brand mark — the uptime.png icon used in nav, auth, and splash. */
export default function BrandLogo({ className = '', size }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <img
      src="/uptime.png"
      alt=""
      className={`logo-mark ${className}`.trim()}
      style={style}
      width={size || 34}
      height={size || 34}
      decoding="async"
    />
  );
}
