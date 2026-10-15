export type Page =
  | "Home"
  | "Insights"
  | "Dictionary"
  | "Snippets"
  | "Style"
  | "Notes"
  | "Settings"
  | "Help";
export type Dictation = {
  id: string;
  raw: string;
  text: string;
  words: number;
  createdAt: string;
  duration: number;
  app: string;
  sample?: boolean;
};
export type Word = {
  id: string;
  word: string;
  from: string;
  starred: boolean;
  createdAt: string;
};
export type Snippet = {
  id: string;
  trigger: string;
  expansion: string;
  createdAt: string;
};
export type Settings = {
  name: string;
  language: string;
  cleanup: boolean;
  sounds: boolean;
  autoPaste: boolean;
  showBar: boolean;
  shortcut: string;
  style: string;
  privacy: boolean;
};
export type Note = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};
export type SpeechEvent = {
  type: string;
  text?: string;
  message?: string;
  code?: string;
  bundleId?: string;
  name?: string;
  [key: string]: unknown;
};
declare global {
  interface Window {
    flow?: {
      invoke: (channel: string, payload?: unknown) => Promise<any>;
      on: (channel: string, callback: (event: any) => void) => () => void;
    };
  }
}
