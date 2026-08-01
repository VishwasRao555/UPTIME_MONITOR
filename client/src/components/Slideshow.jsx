import { useEffect, useState } from 'react';
import slideDown from '../assets/img1.jpg';
import slideAlert from '../assets/img2.avif';
import slideOps from '../assets/img3.jpg';

const SLIDES = [
  { src: slideDown, key: 'down' },
  { src: slideAlert, key: 'alert' },
  { src: slideOps, key: 'ops' },
];

const HOLD_MS = 2000;

/**
 * The three-up illustration carousel, in the artwork's own colours.
 *
 * It loops forever and never pauses on hover — the panel sits under wherever
 * the cursor rests while you read the form, so a hover-pause made the loop
 * look broken. Only a hidden tab stops it, since nobody is watching then.
 *
 * The whole art panel is aria-hidden decoration, so the dots are plain spans:
 * a focusable control inside aria-hidden would be a trap for keyboard users,
 * and there is nothing here they would miss.
 */
export default function Slideshow() {
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);

  useEffect(() => {
    if (tabHidden) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), HOLD_MS);
    return () => clearInterval(id);
  }, [tabHidden]);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <>
      <div className="slide-plate">
        {!ready && <div className="skeleton slide-skeleton" />}

        {SLIDES.map((slide, i) => (
          <img
            key={slide.key}
            src={slide.src}
            alt=""
            className={`slide ${i === index ? 'on' : ''}`}
            onLoad={i === 0 ? () => setReady(true) : undefined}
          />
        ))}
      </div>

      <div className="slide-dots">
        {SLIDES.map((slide, i) => (
          <span key={slide.key} className={`slide-dot ${i === index ? 'on' : ''}`} />
        ))}
      </div>
    </>
  );
}
