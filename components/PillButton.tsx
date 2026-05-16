type PillButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
};

import Link from "next/link";

export default function PillButton({
  children,
  onClick,
  href,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
}: PillButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-full px-8 py-3 font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-black text-white hover:bg-neutral-800 active:scale-[0.98]"
      : "bg-white text-black border border-neutral-300 hover:bg-neutral-50";

  if (href && !disabled) {
    return (
      <Link href={href} className={`${base} ${styles} ${className}`}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
