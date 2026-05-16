import { Playfair_Display } from "next/font/google";
import Byte from "@/components/Byte";
import SpeechBubble from "@/components/SpeechBubble";
import PillButton from "@/components/PillButton";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <div className="max-w-3xl w-full flex flex-col items-center text-center gap-10">
        <h1
          className={`${playfair.className} text-7xl md:text-9xl font-black tracking-tight text-black`}
        >
          Glitch
        </h1>
        <p className="text-3xl font-medium text-neutral-600 italic">
          let&apos;s break the system
        </p>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-1 mt-8">
          <Byte size={280} mood="default" priority />
          <SpeechBubble tail="left" className="md:max-w-xs md:mt-6">
            <span className="text-xl font-medium">ready to learn?</span>
          </SpeechBubble>
        </div>

        <div className="mt-6">
          <PillButton href="/onboarding" className="text-lg px-10 py-4">
            Let&apos;s Go →
          </PillButton>
        </div>
      </div>
    </main>
  );
}
