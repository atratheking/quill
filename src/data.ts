import type { Dictation, Settings, Word, Snippet } from "./types";
const date = (days: number, hours: number, minutes = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};
export const sampleHistory: Dictation[] = [
  {
    id: "sample-1",
    text: "Hey team, just finished reviewing the latest designs. The new onboarding flow looks great! Let’s aim to have the first prototype ready by Thursday so we can get some early feedback.",
    raw: "Hey team um just finished reviewing the latest designs the new onboarding flow looks great lets aim to have the first prototype ready by Thursday so we can get some early feedback",
    words: 34,
    createdAt: date(0, 10, 42),
    duration: 14,
    app: "Slack",
    sample: true,
  },
  {
    id: "sample-2",
    text: "A little reminder to make more room for the things that matter. Less overthinking, more creating.",
    raw: "A little reminder to make more room for the things that matter less overthinking more creating",
    words: 18,
    createdAt: date(0, 9, 58),
    duration: 8,
    app: "Notion",
    sample: true,
  },
  {
    id: "sample-3",
    text: "Hi Sarah,\n\nThanks for sending this over. I’ve had a chance to look through the proposal and everything looks good on my end. Happy to jump on a quick call tomorrow to talk through next steps.\n\nBest, Alex",
    raw: "Hi Sarah new paragraph thanks for sending this over Ive had a chance to look through the proposal and everything looks good on my end happy to jump on a quick call tomorrow to talk through next steps new paragraph best Alex",
    words: 43,
    createdAt: date(0, 9, 15),
    duration: 19,
    app: "Mail",
    sample: true,
  },
  {
    id: "sample-4",
    text: "What if the best ideas are the ones you haven’t written down yet? Build a place to catch them.",
    raw: "what if the best ideas are the ones you havent written down yet build a place to catch them",
    words: 21,
    createdAt: date(1, 16, 32),
    duration: 9,
    app: "Notes",
    sample: true,
  },
  {
    id: "sample-5",
    text: "Can you move our catch-up to 2 pm? I’ll send through the updated document before then.",
    raw: "Can you move our catch up to 2 pm Ill send through the updated document before then",
    words: 18,
    createdAt: date(1, 14, 6),
    duration: 7,
    app: "Messages",
    sample: true,
  },
  {
    id: "sample-6",
    text: "Create a reusable button component with primary and secondary variants. Add a loading state and make sure it works well with keyboard navigation.",
    raw: "create a reusable button component with primary and secondary variants add a loading state and make sure it works well with keyboard navigation",
    words: 25,
    createdAt: date(1, 11, 48),
    duration: 11,
    app: "Cursor",
    sample: true,
  },
];
export const defaultSettings: Settings = {
  name: "",
  language: "en-AU",
  cleanup: true,
  sounds: false,
  autoPaste: true,
  showBar: false,
  shortcut: "CommandOrControl+Shift+Space",
  style: "casual",
  privacy: true,
};
export const sampleWords: Word[] = [
  {
    id: "w1",
    word: "Quill",
    from: "kwill",
    starred: true,
    createdAt: date(3, 12),
  },
  {
    id: "w2",
    word: "Notion",
    from: "",
    starred: false,
    createdAt: date(3, 11),
  },
  {
    id: "w3",
    word: "Figma",
    from: "fig ma",
    starred: false,
    createdAt: date(5, 10),
  },
];
export const sampleSnippets: Snippet[] = [
  {
    id: "s1",
    trigger: "my sign off",
    expansion: "Thanks so much,\nAlex",
    createdAt: date(2, 9),
  },
  {
    id: "s2",
    trigger: "quick follow up",
    expansion:
      "Just following up on this. Let me know if you have any questions — happy to help!",
    createdAt: date(4, 9),
  },
];
