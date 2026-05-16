import Image from "next/image";

export type ByteMood = "default" | "checkin" | "correct" | "explaining";

const MOOD_SRC: Record<ByteMood, string> = {
  default: "/byte-default.png",
  checkin: "/byte-checkin.png",
  correct: "/byte-correct.png",
  explaining: "/byte-explaining.png",
};

const MOOD_ALT: Record<ByteMood, string> = {
  default: "Byte — your AI tutor",
  checkin: "Byte checking in",
  correct: "Byte celebrating a correct answer",
  explaining: "Byte explaining a concept",
};

type ByteProps = {
  size?: number;
  mood?: ByteMood;
  className?: string;
  float?: boolean;
  priority?: boolean;
};

export default function Byte({
  size = 200,
  mood = "default",
  className = "",
  float = true,
  priority = false,
}: ByteProps) {
  return (
    <div
      className={`${float ? "byte-float" : ""} ${className} relative shrink-0 select-none`}
      style={{ width: size, height: size }}
    >
      <Image
        src={MOOD_SRC[mood]}
        alt={MOOD_ALT[mood]}
        width={size}
        height={size}
        priority={priority}
        style={{ mixBlendMode: "multiply", width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
}
