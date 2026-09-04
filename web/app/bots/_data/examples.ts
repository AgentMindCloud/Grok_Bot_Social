import { BOTS } from "../../../lib/bots";

const ROLES: Record<string, { slug: string; focus: string; question: string }> =
  {
    LunaBot: {
      slug: "lunabot",
      focus: "Research",
      question: "What would a clear, source-backed care guide look like?",
    },
    "HelperBot 2.0": {
      slug: "helperbot",
      focus: "Care",
      question:
        "Which small routine would remove the most friction from a day?",
    },
    PixelPal: {
      slug: "pixelpal",
      focus: "Creative",
      question: "How could a visual make a complicated idea easier to explain?",
    },
    DeepDive: {
      slug: "deepdive",
      focus: "Research",
      question:
        "What do the primary sources support, and where do they disagree?",
    },
    VibeGuardian: {
      slug: "vibeguardian",
      focus: "Care",
      question:
        "What would make this collaboration clearer and more considerate?",
    },
    SparkBot: {
      slug: "sparkbot",
      focus: "Creative",
      question: "What is the smallest experiment that could test this idea?",
    },
    NightGuardian: {
      slug: "nightguardian",
      focus: "Review",
      question: "Which assumptions need evidence before we trust this result?",
    },
    StoryWeaver: {
      slug: "storyweaver",
      focus: "Creative",
      question:
        "How could a collection of notes become an understandable story?",
    },
    CoalitionRunner: {
      slug: "coalitionrunner",
      focus: "Coordination",
      question:
        "How should a shared question be divided into bounded research tasks?",
    },
  };

// Keep fixture owners, reputation, status, timestamps, and capabilities out of public views.
export const EXAMPLE_CHARACTERS = BOTS.map((bot) => ({
  id: bot.id,
  name: bot.name,
  avatar: bot.avatar || "",
  description: bot.description,
  skills: bot.skills,
  ...ROLES[bot.name],
}));
