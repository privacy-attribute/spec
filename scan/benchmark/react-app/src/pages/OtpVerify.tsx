import { useRef, useState } from 'react';

export function OtpVerify({ destination }: { destination: string }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const refs = useRef<HTMLInputElement[]>([]);
  return (
    <div className="verify">
      <p>We sent a code to {destination}</p> {/* @expect personal mask */}
      <div className="code-boxes">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { if (el) refs.current[i] = el; }}
            inputMode="numeric"
            maxLength={1}
            value={d} // @expect secret block
            onChange={(e) => setDigits(digits.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
      </div>
    </div>
  );
}
