import { pillClass } from '../utils/format';

export default function StatusPill({ label }) {
  return (
    <span className={`pill ${pillClass(label)}`}>
      <span className="tick" />
      {label}
    </span>
  );
}
