"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Byte from "@/components/Byte";
import SpeechBubble from "@/components/SpeechBubble";
import PillButton from "@/components/PillButton";
import {
  DEMO_PERSONAS,
  saveProfile,
  type LearningStyle,
  type LessonLength,
  type SkillLevel,
  type StudentProfile,
} from "@/lib/profile";

type Message = { from: "byte" | "you"; text: string };

const QUESTIONS = [
  "what's your name?",
  "how do you learn best — examples, theory, or visuals?",
  "how much do you already know about this topic? (beginner / intermediate / advanced)",
  "how long do you want lessons to be? (short / medium / deep dives)",
];

const STYLE_OPTIONS: LearningStyle[] = ["examples", "theory", "visuals"];
const LEVEL_OPTIONS: SkillLevel[] = ["beginner", "intermediate", "advanced"];
const LENGTH_OPTIONS: LessonLength[] = ["short", "medium", "deep"];

export default function OnboardingPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    { from: "byte", text: "hi! i'm byte. let's get to know you." },
    { from: "byte", text: QUESTIONS[0] },
  ]);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<Partial<StudentProfile>>({});
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function appendByte(text: string) {
    setMessages((m) => [...m, { from: "byte", text }]);
  }

  function appendYou(text: string) {
    setMessages((m) => [...m, { from: "you", text }]);
  }

  function normalizeStyle(s: string): LearningStyle {
    const v = s.toLowerCase();
    if (v.includes("theory")) return "theory";
    if (v.includes("visual")) return "visuals";
    return "examples";
  }

  function normalizeLevel(s: string): SkillLevel {
    const v = s.toLowerCase();
    if (v.includes("adv")) return "advanced";
    if (v.includes("inter")) return "intermediate";
    return "beginner";
  }

  function normalizeLength(s: string): LessonLength {
    const v = s.toLowerCase();
    if (v.includes("deep")) return "deep";
    if (v.includes("med")) return "medium";
    return "short";
  }

  function handleAnswer(raw: string) {
    const value = raw.trim();
    if (!value) return;
    appendYou(value);
    setInput("");

    const next: Partial<StudentProfile> = { ...profile };
    if (step === 0) next.name = value;
    if (step === 1) next.learningStyle = normalizeStyle(value);
    if (step === 2) next.skillLevel = normalizeLevel(value);
    if (step === 3) next.lessonLength = normalizeLength(value);

    setProfile(next);

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      setTimeout(() => appendByte(QUESTIONS[step + 1]), 350);
    } else {
      const complete: StudentProfile = {
        name: next.name || "friend",
        learningStyle: next.learningStyle || "examples",
        skillLevel: next.skillLevel || "beginner",
        lessonLength: next.lessonLength || "short",
        createdAt: new Date().toISOString(),
      };
      saveProfile(complete);
      setProfile(complete);
      setDone(true);
      setTimeout(() => appendByte(funnyResponse(complete)), 400);
    }
  }

  function funnyResponse(p: StudentProfile): string {
    const styleBit =
      p.learningStyle === "visuals"
        ? "i'll draw word-pictures so vivid you can taste them"
        : p.learningStyle === "theory"
        ? "we're going full nerd-mode, abstractions on abstractions"
        : "expect more examples than a cooking show";
    const levelBit =
      p.skillLevel === "advanced"
        ? "i won't insult you with baby steps"
        : p.skillLevel === "intermediate"
        ? "no hand-holding, but i'll catch you if you trip"
        : "we'll start from zero — embarrassment-free zone";
    const lengthBit =
      p.lessonLength === "deep"
        ? "buckle up, deep dives ahead"
        : p.lessonLength === "medium"
        ? "medium-rare lessons coming up"
        : "snack-sized lessons, easy to digest";
    return `nice to meet you ${p.name}! ${styleBit}. ${levelBit}. ${lengthBit}. ready?`;
  }

  function selectPersona(key: keyof typeof DEMO_PERSONAS) {
    const persona = { ...DEMO_PERSONAS[key], createdAt: new Date().toISOString() };
    saveProfile(persona);
    setProfile(persona);
    setMessages([
      { from: "byte", text: `loaded the "${key}" demo profile.` },
      { from: "byte", text: funnyResponse(persona) },
    ]);
    setDone(true);
  }

  const quickReplies =
    step === 1 ? STYLE_OPTIONS : step === 2 ? LEVEL_OPTIONS : step === 3 ? LENGTH_OPTIONS : null;

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <Byte size={80} mood={done ? "correct" : "checkin"} priority />
          <div>
            <h1 className="text-2xl font-bold">onboarding with byte</h1>
            <p className="text-sm text-neutral-500">just a few quick questions</p>
          </div>
        </div>

        {!done && (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-neutral-400 mb-2">
              or try a demo persona
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(DEMO_PERSONAS).map((key) => (
                <button
                  key={key}
                  onClick={() => selectPersona(key as keyof typeof DEMO_PERSONAS)}
                  className="px-4 py-2 rounded-full border border-neutral-300 text-sm hover:bg-neutral-50"
                >
                  {key} — {DEMO_PERSONAS[key].learningStyle},{" "}
                  {DEMO_PERSONAS[key].skillLevel}, {DEMO_PERSONAS[key].lessonLength}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          className="border border-neutral-200 rounded-2xl p-5 h-[420px] overflow-y-auto bg-neutral-50/30 flex flex-col gap-3"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-2xl text-[15px] leading-relaxed ${
                  m.from === "you"
                    ? "bg-black text-white rounded-br-sm"
                    : "bg-white border border-neutral-200 text-neutral-900 rounded-bl-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {!done && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAnswer(input);
            }}
            className="mt-4 flex gap-2"
          >
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="type your answer…"
              className="flex-1 px-5 py-3 rounded-full border border-neutral-300 focus:outline-none focus:border-black"
            />
            <PillButton type="submit" disabled={!input.trim()}>
              send
            </PillButton>
          </form>
        )}

        {!done && quickReplies && (
          <div className="mt-3 flex flex-wrap gap-2">
            {quickReplies.map((opt) => (
              <button
                key={opt}
                onClick={() => handleAnswer(opt)}
                className="px-4 py-2 rounded-full border border-neutral-300 text-sm hover:bg-neutral-50"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {done && (
          <div className="mt-6 flex justify-end">
            <PillButton onClick={() => router.push("/dashboard")}>
              start learning →
            </PillButton>
          </div>
        )}
      </div>
    </main>
  );
}
