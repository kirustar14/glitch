import Byte from "@/components/Byte";
import SpeechBubble from "@/components/SpeechBubble";
import PillButton from "@/components/PillButton";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <div className="max-w-3xl w-full flex flex-col items-center text-center gap-10">
        <h1 className="text-7xl md:text-8xl font-bold tracking-tight text-black">
          Glitch
        </h1>
        <p className="text-xl md:text-2xl text-neutral-500 font-light">
          learn smarter, not harder
        </p>

        <div className="flex flex-col md:flex-row items-center gap-6 mt-8">
          <Byte size={200} mood="default" priority />
          <SpeechBubble tail="left" className="md:max-w-xs">
            <span className="text-lg">ready to learn?</span>
          </SpeechBubble>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <PillButton href="/onboarding">let&apos;s go →</PillButton>
          <PillButton href="/upload" variant="secondary">
            upload your course →
          </PillButton>
        </div>
      </div>
    </main>
  );
}
