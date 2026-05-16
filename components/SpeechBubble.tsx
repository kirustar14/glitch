type SpeechBubbleProps = {
  children: React.ReactNode;
  tail?: "left" | "right" | "bottom" | "none";
  className?: string;
};

export default function SpeechBubble({
  children,
  tail = "left",
  className = "",
}: SpeechBubbleProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      <div className="bg-white border border-neutral-200 rounded-2xl px-5 py-3 shadow-sm text-neutral-900 leading-relaxed">
        {children}
      </div>
      {tail === "left" && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-l border-b border-neutral-200 rotate-45" />
      )}
      {tail === "right" && (
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-r border-t border-neutral-200 rotate-45" />
      )}
      {tail === "bottom" && (
        <div className="absolute left-8 -bottom-2 w-4 h-4 bg-white border-r border-b border-neutral-200 rotate-45" />
      )}
    </div>
  );
}
