export type LearningStyle = "examples" | "theory" | "visuals";
export type SkillLevel = "beginner" | "intermediate" | "advanced";
export type LessonLength = "short" | "medium" | "deep";

export type StudentProfile = {
  name: string;
  learningStyle: LearningStyle;
  skillLevel: SkillLevel;
  lessonLength: LessonLength;
  interests: string;
  createdAt: string;
};

export type Progress = {
  completedTopics: string[];
  checkpoints: Record<string, { correct: number; total: number }>;
};

const PROFILE_KEY = "studentProfile";
const PROGRESS_KEY = "studentProgress";

export type Course = {
  name: string;
  slug: string;
  uploadedAt: string;
};

function studentScope(): string {
  if (typeof window === "undefined") return "default";
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return "default";
    const parsed = JSON.parse(raw) as StudentProfile;
    if (!parsed?.name) return "default";
    return slugify(parsed.name);
  } catch {
    return "default";
  }
}

function coursesKey(): string {
  return `courses_${studentScope()}`;
}

function selectedCourseKey(): string {
  return `selectedCourse_${studentScope()}`;
}

export function loadCourses(): Course[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(coursesKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Course[]) : [];
  } catch {
    return [];
  }
}

export function saveCourses(courses: Course[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(coursesKey(), JSON.stringify(courses));
}

export function addCourse(course: Course): Course[] {
  const existing = loadCourses().filter((c) => c.slug !== course.slug);
  const next = [...existing, course];
  saveCourses(next);
  return next;
}

export function loadSelectedCourse(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(selectedCourseKey()) ?? "";
}

export function saveSelectedCourse(slug: string) {
  if (typeof window === "undefined") return;
  const key = selectedCourseKey();
  if (slug) localStorage.setItem(key, slug);
  else localStorage.removeItem(key);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.pdf$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "course"
  );
}

export function prettifyFilename(filename: string): string {
  return (
    filename
      .replace(/\.pdf$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled Course"
  );
}

export function loadProfile(): StudentProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as StudentProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: StudentProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return { completedTopics: [], checkpoints: {} };
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as Progress;
  } catch {}
  return { completedTopics: [], checkpoints: {} };
}

export function saveProgress(progress: Progress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function markTopicComplete(topic: string) {
  const p = loadProgress();
  if (!p.completedTopics.includes(topic)) {
    p.completedTopics.push(topic);
    saveProgress(p);
  }
}

export function recordCheckpoint(topic: string, correct: boolean) {
  const p = loadProgress();
  const c = p.checkpoints[topic] ?? { correct: 0, total: 0 };
  c.total += 1;
  if (correct) c.correct += 1;
  p.checkpoints[topic] = c;
  saveProgress(p);
}

export const DEMO_PERSONAS: Record<string, StudentProfile> = {
  Alex: {
    name: "Alex",
    learningStyle: "visuals",
    skillLevel: "beginner",
    lessonLength: "short",
    interests: "Pokemon",
    createdAt: "",
  },
  Sam: {
    name: "Sam",
    learningStyle: "theory",
    skillLevel: "advanced",
    lessonLength: "deep",
    interests: "F1 racing",
    createdAt: "",
  },
  Jordan: {
    name: "Jordan",
    learningStyle: "examples",
    skillLevel: "intermediate",
    lessonLength: "medium",
    interests: "Percy Jackson",
    createdAt: "",
  },
};
