/** Punt numerat. `muted` = pas encara no accessible (gris, sense fons blau). */
export function StepNumber({ number, muted }: { number: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4.5 h-4.5 mr-1.5 rounded-full text-[0.7rem] font-semibold align-middle ${
        muted ? "bg-faint text-muted" : "bg-primary text-white"
      }`}
    >
      {number}
    </span>
  );
}
