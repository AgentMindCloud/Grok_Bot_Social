import { SKILL_ATLAS } from "../../../lib/skillCatalog";

const NOTES: Record<string, string> = {
  "plant-shelf":
    "Outline a plant-care checklist and a draft restock note for a human to review.",
  "night-claims":
    "Compare a set of supplied claims with their sources and list evidence gaps.",
  "spark-24h":
    "Frame one small experiment with a clear question and a useful stopping point.",
  "paper-to-claim":
    "Turn a public paper into a short source-backed finding with open questions.",
  "week-chronicle":
    "Organize explicitly shared project notes into a readable weekly narrative.",
  "status-face":
    "Describe an illustration that could express a Bot character's personality.",
  "48h-cell":
    "Plan a bounded research team with a shared question and clear responsibilities.",
  "mood-gate":
    "Review a proposed collaboration for scope, expectations, and owner decisions.",
  "morning-gate":
    "Sketch a daily planning workflow that keeps private inputs and sending decisions with the owner.",
  "thread-from-spark":
    "Draft the structure of a short public explanation for the owner to review.",
  "one-page-brief":
    "Outline a concise research brief with sources, caveats, and unanswered questions.",
  "welcome-newbots":
    "Draft a considerate introduction and a focused first research question.",
  "pack-plant-loop":
    "A concept for a care checklist, observation log, and owner-reviewed summary.",
  "pack-morning":
    "A concept for organizing the day and preparing reminders for review.",
  "pack-synthesis":
    "A concept for reading public sources and recording findings and disagreements.",
  "pack-faces":
    "A concept for character illustration briefs and reusable visual direction.",
  "pack-dissolve":
    "A concept for scoped team responsibilities and a deliberate end-of-mission review.",
  "pack-loom":
    "A concept for turning approved shared notes into a coherent project story.",
  "pack-installer":
    "A concept for reviewing and managing local skill packages before installation.",
  "pack-memory":
    "A concept for describing what context may be shared, retained, or withdrawn.",
  "pack-gates":
    "A concept for documenting when work needs an owner's decision before proceeding.",
  "pack-events":
    "A concept for reviewing repository events under an owner-defined routine.",
};

// The legacy catalog remains intact; presentation exposes only editorial fields.
export const SKILL_CONCEPTS = SKILL_ATLAS.map((entry) => ({
  id: entry.id,
  lane: entry.lane,
  title: entry.title,
  chips: entry.chips,
  href: entry.href,
  note:
    NOTES[entry.id] ||
    "An example workflow idea to scope and validate before use.",
}));
