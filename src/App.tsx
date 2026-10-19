import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import {
  Feather,
  LayoutGrid,
  BookText,
  Scissors,
  CaseSensitive,
  Sparkles,
  StickyNote,
  Settings as SettingsIcon,
  HelpCircle,
  PanelLeft,
  Bell,
  UserCircle,
  Search,
  Plus,
  ChevronDown,
  ArrowUpRight,
  Copy,
  Check,
  Trash2,
  X,
  Mic,
  Square,
  ArrowRight,
  Star,
  Clock,
  Flame,
  TrendingUp,
  Keyboard,
  Globe,
  Volume2,
  Shield,
  Download,
  SlidersHorizontal,
  Mail,
  MessageSquare,
  FileText,
  MoreHorizontal,
  Play,
  Command,
  CheckCircle2,
  ArrowLeft,
  Pencil,
  RefreshCw,
  Sun,
  ChevronRight,
} from "lucide-react";
import {
  sampleHistory,
  sampleWords,
  sampleSnippets,
  defaultSettings,
} from "./data";
import { watchTheme } from "./theme.mjs";
import type { Page, Dictation, Word, Snippet, Settings, Note } from "./types";
import {
  polishText,
  makeDictation,
  wordCount,
  validateEntry,
} from "./engine.mjs";

type Workspace = {
  history: Dictation[];
  dictionary: Word[];
  snippets: Snippet[];
  settings: Settings;
  notes: Note[];
};
const initial: Workspace = {
  history: sampleHistory,
  dictionary: sampleWords,
  snippets: sampleSnippets,
  settings: defaultSettings,
  notes: [],
};
const sampleText =
  "um hey team the the new designs are ready comma can you take a look before Thursday question mark";
function useWorkspace() {
  const [data, setData] = useState<Workspace>(() => {
    try {
      return {
        ...initial,
        ...JSON.parse(
          localStorage.getItem("quill-workspace") ||
            localStorage.getItem("flow-workspace") ||
            "{}",
        ),
      };
    } catch {
      return initial;
    }
  });
  const [loaded, setLoaded] = useState(!window.flow);
  useEffect(() => {
    if (!window.flow) return;
    let live = true;
    window.flow.invoke("store:get").then(async (saved) => {
      if (!live) return;
      setData({ ...initial, ...saved });
      setLoaded(true);
      for (const key of Object.keys(initial))
        if (!(key in saved))
          await window.flow!.invoke("store:set", {
            key,
            value: initial[key as keyof Workspace],
          });
    });
    const off = window.flow.on("store", (saved) => {
      if (live) setData({ ...initial, ...saved });
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  function update<K extends keyof Workspace>(key: K, value: Workspace[K]) {
    setData((old) => {
      const next = { ...old, [key]: value };
      if (!window.flow)
        localStorage.setItem("quill-workspace", JSON.stringify(next));
      return next;
    });
    if (window.flow) window.flow.invoke("store:set", { key, value });
  }
  return { data, update, loaded };
}
function Logo() {
  return (
    <div className="logo">
      <Feather size={27} strokeWidth={1.8} aria-hidden="true" />
      <span>Quill</span>
    </div>
  );
}
const isWindows = window.flow?.platform === "win32" || navigator.userAgent.includes("Windows");
function shortcutKeys(shortcut: string) {
  return shortcut
    .replace("CommandOrControl", isWindows ? "Ctrl" : "⌘")
    .replace("Control", isWindows ? "Ctrl" : "⌃")
    .replace("Alt", isWindows ? "Alt" : "⌥")
    .replace("Shift", isWindows ? "Shift" : "⇧")
    .split("+");
}
function Shortcut({
  small = false,
  value = defaultSettings.shortcut,
}: {
  small?: boolean;
  value?: string;
}) {
  return (
    <span className={"shortcut " + (small ? "small" : "")}>
      {shortcutKeys(value).map((key, i) => (
        <kbd key={i}>{key}</kbd>
      ))}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    (
      ref.current?.querySelector<HTMLElement>("input,textarea") ||
      ref.current?.querySelector<HTMLElement>("button")
    )?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const list = ref.current?.querySelectorAll<HTMLElement>(
          'button,input,textarea,select,[tabindex="0"]',
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prior?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide " : "") + className}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={"toggle " + (value ? "on" : "")}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}
function AppIcon({ name }: { name: string }) {
  const icons: Record<string, ReactNode> = {
    Slack: <span className="slack-mark">✣</span>,
    Notion: <b>N</b>,
    Mail: <Mail size={12} />,
    Notes: <StickyNote size={12} />,
    Messages: <MessageSquare size={12} />,
    Cursor: <Command size={12} />,
  };
  return (
    <span className={"app-icon " + name.toLowerCase()}>
      {icons[name] || <Mic size={12} />}
    </span>
  );
}
const dateLabel = (date: string) => {
  const d = new Date(date),
    today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  today.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
};
const time = (date: string) =>
  new Date(date).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
function App() {
  const { data, update, loaded } = useWorkspace();
  const { history, dictionary, snippets, settings, notes } = data;
  useEffect(() => watchTheme(settings.theme || "light", {
    root: document.documentElement,
    media: window.matchMedia("(prefers-color-scheme: dark)"),
    onChange: (theme: string) => {
      if (!new URLSearchParams(location.search).has("overlay"))
        window.flow?.invoke("theme:set", theme);
    },
  }), [settings.theme]);
  const [page, setPage] = useState<Page | "Polish">("Home");
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState<null | (() => void)>(null);
  const [detail, setDetail] = useState<Dictation | null>(null);
  const [speech, setSpeech] = useState<any>({
    status: "idle",
    text: "",
    error: "",
  });
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [draftWord, setDraftWord] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTrigger, setDraftTrigger] = useState("");
  const [draftExpansion, setDraftExpansion] = useState("");
  const [formError, setFormError] = useState("");
  const [libraryTab, setLibraryTab] = useState("All");
  const [sort, setSort] = useState("Newest first");
  const [settingsTab, setSettingsTab] = useState("General");
  const [permissions, setPermissions] = useState<{
    accessibility: boolean;
    appAccessibility: boolean;
    microphone: string;
    speech: string;
  } | null>(null);
  const [checkingPermissions, setCheckingPermissions] = useState(false);
  async function checkPermissions() {
    if (!window.flow) return;
    setCheckingPermissions(true);
    try {
      setPermissions(await window.flow.invoke("permissions:status"));
    } catch {
      notify(
        "Could not check permissions. Quit and reopen Quill, then try again.",
      );
    } finally {
      setCheckingPermissions(false);
    }
  }
  const [polishInput, setPolishInput] = useState(sampleText);
  const [polishOutput, setPolishOutput] = useState("");
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState(-1);
  const [demoRaw, setDemoRaw] = useState(sampleText);
  const [demoResult, setDemoResult] = useState("");
  const overlay = new URLSearchParams(location.search).has("overlay");
  function notify(message: string, action?: () => void) {
    setToast(message);
    setUndo(() => action || null);
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast("");
      setUndo(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!window.flow) return;
    window.flow.invoke("speech:state").then(setSpeech);
    const off = window.flow.on("speech", setSpeech);
    return off;
  }, []);
  useEffect(
    () =>
      window.flow?.on("navigate", (destination) => {
        if (destination.page === "Settings") {
          setPage("Settings");
          setSettingsTab(destination.settingsTab || "General");
        }
      }),
    [],
  );
  useEffect(() => {
    if (page !== "Settings" || settingsTab !== "System" || !window.flow) return;
    checkPermissions();
    const refresh = () => {
      checkPermissions();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [page, settingsTab]);
  useEffect(() => {
    setSearch("");
    setLibraryTab("All");
    setSelectedHistory(-1);
  }, [page]);
  useEffect(() => {
    if (
      page === "Notes" &&
      notes.length &&
      !notes.some((n) => n.id === selectedNote)
    )
      setSelectedNote(notes[0].id);
  }, [page, notes, selectedNote]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        if (page !== "Settings" && !modal && !detail) searchRef.current?.focus();
      }
      if (e.key === "Escape" && speech.status !== "idle") {
        window.flow?.invoke("speech:cancel");
      }
      if (
        !window.flow &&
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.code === "Space"
      ) {
        e.preventDefault();
        setModal("dictate");
      }
      if (
        page === "Home" &&
        !modal &&
        !detail &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedHistory((i) => Math.min(i + 1, history.length - 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedHistory((i) => Math.max(0, i - 1));
        }
        if (e.key === "Enter" && selectedHistory >= 0)
          setDetail(history[selectedHistory]);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [page, modal, detail, history, selectedHistory, speech.status]);
  const active =
    speech.status === "listening" ||
    speech.status === "starting" ||
    speech.status === "processing";
  async function record() {
    if (window.flow) {
      try {
        await window.flow.invoke("speech:toggle");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not start dictation");
      }
    } else setModal("dictate");
  }
  async function copy(text: string) {
    try {
      if (window.flow) await window.flow.invoke("clipboard:copy", text);
      else await navigator.clipboard.writeText(text);
      notify("Copied to clipboard");
    } catch {
      notify("Clipboard unavailable. Select the text and copy it.");
    }
  }
  function changeSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    update("settings", { ...settings, [key]: value });
  }
  function addWord(word?: Word) {
    setEditingWord(word || null);
    setDraftWord(word?.word || "");
    setDraftFrom(word?.from || "");
    setFormError("");
    setModal("word");
  }
  function addSnippet(snippet?: Snippet) {
    setEditingSnippet(snippet || null);
    setDraftTrigger(snippet?.trigger || "");
    setDraftExpansion(snippet?.expansion || "");
    setFormError("");
    setModal("snippet");
  }
  function saveWord() {
    const error = validateEntry(
      draftWord,
      [...dictionary, ...snippets],
      editingWord?.id,
    );
    if (error) {
      setFormError(error);
      return;
    }
    const value = {
      id: editingWord?.id || crypto.randomUUID(),
      word: draftWord.trim(),
      from: draftFrom.trim(),
      starred: editingWord?.starred || false,
      createdAt: new Date().toISOString(),
    };
    update(
      "dictionary",
      editingWord
        ? dictionary.map((w) => (w.id === value.id ? value : w))
        : [value, ...dictionary],
    );
    setModal(null);
    notify(editingWord ? "Word updated" : "Added to your dictionary");
  }
  function saveSnippet() {
    const error = validateEntry(
      draftTrigger,
      [...snippets, ...dictionary],
      editingSnippet?.id,
    );
    if (error || !draftExpansion.trim()) {
      setFormError(error || "Please enter the expanded text.");
      return;
    }
    const value = {
      id: editingSnippet?.id || crypto.randomUUID(),
      trigger: draftTrigger.trim(),
      expansion: draftExpansion.trim(),
      createdAt: new Date().toISOString(),
    };
    update(
      "snippets",
      editingSnippet
        ? snippets.map((s) => (s.id === value.id ? value : s))
        : [value, ...snippets],
    );
    setModal(null);
    notify(editingSnippet ? "Snippet updated" : "Snippet created");
  }
  function newNote(body = "") {
    const note = {
      id: crypto.randomUUID(),
      title: "Untitled note",
      body,
      updatedAt: new Date().toISOString(),
    };
    update("notes", [note, ...notes]);
    setSelectedNote(note.id);
    setPage("Notes");
  }
  const realHistory = history.filter((h) => !h.sample);
  const totalWords = realHistory.reduce((total, h) => total + h.words, 0);
  const totalTime = realHistory.reduce((total, h) => total + h.duration, 0);
  const wpm = totalTime ? Math.round((totalWords / totalTime) * 60) : 0;
  const activeDays = new Set(
    realHistory.map((h) => new Date(h.createdAt).toDateString()),
  );
  let streak = 0;
  const day = new Date();
  if (!activeDays.has(day.toDateString())) day.setDate(day.getDate() - 1);
  while (activeDays.has(day.toDateString())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  const filteredHistory = useMemo(
    () =>
      history.filter((h) =>
        (h.text + " " + h.app).toLowerCase().includes(search.toLowerCase()),
      ),
    [history, search],
  );
  const groups = useMemo(() => {
    const result: Record<string, Dictation[]> = {};
    filteredHistory.forEach((h) => {
      const label = dateLabel(h.createdAt);
      (result[label] ||= []).push(h);
    });
    return Object.entries(result);
  }, [filteredHistory]);
  let entries: (Word | Snippet)[] =
    page === "Dictionary" ? dictionary : snippets;
  entries = entries
    .filter((entry) =>
      JSON.stringify(entry).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "Alphabetical (A–Z)"
        ? ("word" in a ? a.word : a.trigger).localeCompare(
            "word" in b ? b.word : b.trigger,
          )
        : sort === "Starred first"
          ? Number("starred" in b && b.starred) -
            Number("starred" in a && a.starred)
          : sort === "Oldest first"
            ? a.createdAt.localeCompare(b.createdAt)
            : b.createdAt.localeCompare(a.createdAt),
    );
  if (overlay)
    return (
      <div className="overlay-shell">
        {speech.error && (
          <button
            className="bar-error"
            onClick={() => window.flow?.invoke("window:show")}
          >
            {speech.error}
            <ArrowUpRight size={14} />
          </button>
        )}
        {active && speech.text && (
          <div className="bar-transcript">{speech.text}</div>
        )}
        <div className={"flow-bar " + (active ? "recording" : "")}>
          <button
            aria-label="Open Quill"
            onClick={() => window.flow?.invoke("window:show")}
          >
            <Feather size={19} strokeWidth={1.8} />
          </button>
          <span className="bar-divider" />
          {active ? (
            <>
              <div className="waveform">
                {Array.from({ length: 14 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${i * -0.12}s` }} />
                ))}
              </div>
              <span className="bar-label">
                {speech.status === "processing"
                  ? "Finishing…"
                  : speech.status === "starting"
                    ? "Connecting…"
                    : "Listening"}
              </span>
              <button
                className="stop-button"
                aria-label="Stop dictation"
                onClick={() => window.flow?.invoke("speech:stop")}
              >
                <Square size={11} fill="currentColor" />
              </button>
              <button
                aria-label="Cancel dictation"
                onClick={() => window.flow?.invoke("speech:cancel")}
              >
                <X size={15} />
              </button>
            </>
          ) : (
            <>
              <button className="bar-start" onClick={record}>
                <Mic size={14} />
                <span>Start dictating</span>
              </button>
              <span className="bar-key">
                {shortcutKeys(settings.shortcut).join(" ")}
              </span>
            </>
          )}
        </div>
      </div>
    );
  return (
    <div
      inert={page === "Settings" || modal !== null || detail !== null}
      className={
        "app " + (isWindows ? "windows " : "") + (collapsed ? "collapsed " : "") + (window.flow ? "native" : "")
      }
    >
      <header className="titlebar">
        <div className="window-controls browser-only">
          <button
            aria-label="Close window"
            onClick={() => window.flow?.invoke("window:close")}
          />
          <button
            aria-label="Minimize window"
            onClick={() => window.flow?.invoke("window:minimize")}
          />
          <button
            aria-label="Maximize window"
            onClick={() => window.flow?.invoke("window:maximize")}
          />
        </div>
        <button
          className="icon-button sidebar-toggle"
          aria-label="Toggle sidebar"
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeft size={17} />
        </button>
        <div className="titlebar-right">
          <span className="local-label">LOCAL WORKSPACE</span>
          <button
            className="icon-button"
            aria-label="Notifications"
            onClick={() => setModal("notifications")}
          >
            <Bell size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Your account"
            onClick={() => {
              setPage("Settings");
              setSettingsTab("Account");
            }}
          >
            <UserCircle size={19} />
          </button>
        </div>
      </header>
      <aside className="sidebar">
        <button
          className="brand-button"
          onClick={() => setPage("Home")}
          aria-label="Quill home"
        >
          <Logo />
        </button>
        <nav>
          {(
            [
              { name: "Home", icon: LayoutGrid },
              { name: "Dictionary", icon: BookText },
              { name: "Snippets", icon: Scissors },
              { name: "Style", icon: CaseSensitive },
              { name: "Polish", icon: Sparkles },
              { name: "Notes", icon: StickyNote },
            ] as const
          ).map((item) => (
            <button
              key={item.name}
              aria-label={item.name}
              title={collapsed ? item.name : undefined}
              className={"nav-item " + (page === item.name ? "active" : "")}
              onClick={() => setPage(item.name)}
            >
              <item.icon size={20} />
              <span>{item.name}</span>
              {item.name === "Notes" && notes.length > 0 && (
                <small>{notes.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            aria-label="Keyboard shortcuts"
            onClick={() => setModal("shortcuts")}
          >
            <Keyboard size={20} />
            <span>Keyboard shortcuts</span>
          </button>
          <button
            className="nav-item"
            aria-label="Made for your voice"
            onClick={() => setModal("about")}
          >
            <Sparkles size={20} />
            <span>Made for your voice</span>
          </button>
          <button
            className={"nav-item " + (page === "Settings" ? "active" : "")}
            aria-label="Settings"
            onClick={() => setPage("Settings")}
          >
            <SettingsIcon size={20} />
            <span>Settings</span>
          </button>
          <button
            className={"nav-item " + (page === "Help" ? "active" : "")}
            aria-label="Help"
            onClick={() => setPage("Help")}
          >
            <HelpCircle size={20} />
            <span>Help</span>
          </button>
        </div>
      </aside>
      <main
        className={
          "main-panel " + (page === "Settings" ? "settings-panel" : "")
        }
      >
        <div className="page-content" key={page}>
          {(page === "Home" || page === "Settings") && (
            <>
              <div className="page-heading home-heading">
                <h1>Welcome back{settings.name ? `, ${settings.name}` : ""}</h1>
                <button
                  className="stats-pill"
                  onClick={() => setPage("Insights")}
                  aria-label="View your insights"
                >
                  <span>
                    🔥{" "}
                    {streak
                      ? `${streak} day${streak === 1 ? "" : "s"}`
                      : "Ready to write"}
                  </span>
                  <i />
                  <span>🚀 {totalWords.toLocaleString()} words</span>
                  <i />
                  <span>🏆 {wpm} WPM</span>
                </button>
              </div>
              <section className="hero home-hero">
                <div className="hero-inner">
                  <h2>
                    Press <em>{shortcutKeys(settings.shortcut).join(" + ")}</em>{" "}
                    to dictate
                  </h2>
                  <p>
                    Speak naturally in any app. Quill handles the punctuation,
                    <br className="desktop-break" /> removes fillers, and turns
                    your thoughts into words.
                  </p>
                  <div className="hero-actions">
                    <button
                      className="button cream"
                      onClick={() => setModal("how")}
                    >
                      Show me how <ArrowUpRight size={15} />
                    </button>
                    <button
                      className="hero-link"
                      onClick={() => {
                        setDemoResult("");
                        setModal("demo");
                      }}
                    >
                      <Play size={13} fill="currentColor" /> Try a sample
                    </button>
                  </div>
                </div>
              </section>
              <div className="section-heading history-heading">
                <div>
                  <h2>Dictation history</h2>
                  <span>
                    {realHistory.length
                      ? `${realHistory.length} dictation${realHistory.length !== 1 ? "s" : ""}`
                      : "Your thoughts, all in one place"}
                  </span>
                </div>
                <label className="search-box compact">
                  <Search size={16} />
                  <input
                    ref={searchRef}
                    placeholder="Search dictations"
                    aria-label="Search dictations"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <kbd>{isWindows ? "Ctrl F" : "⌘ F"}</kbd>
                </label>
              </div>
              {!realHistory.length && !search && (
                <div className="sample-notice">
                  <span>
                    <span className="sample-dot" /> Sample dictations · a little
                    inspiration to get you started
                  </span>
                  <button
                    onClick={() => {
                      setDemoResult("");
                      setModal("demo");
                    }}
                  >
                    Make it yours <ArrowRight size={13} />
                  </button>
                </div>
              )}
              {groups.length ? (
                groups.map(([date, items]) => (
                  <section className="history-group" key={date}>
                    <h3>{date}</h3>
                    <div className="history-list">
                      {items.map((entry) => (
                        <div
                          key={entry.id}
                          role="button"
                          tabIndex={0}
                          className={
                            "history-row " +
                            (history[selectedHistory]?.id === entry.id
                              ? "selected"
                              : "")
                          }
                          onClick={() => setDetail(entry)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && setDetail(entry)
                          }
                        >
                          <div className="history-time">
                            {time(entry.createdAt)}
                          </div>
                          <p>{entry.text}</p>
                          <button
                            className="icon-button row-copy"
                            aria-label={`Copy dictation ${entry.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              copy(entry.text);
                            }}
                          >
                            <Copy size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>No dictations found</h3>
                  <p>Try another search or start your first dictation.</p>
                  <button className="button" onClick={() => setSearch("")}>
                    Clear search
                  </button>
                </div>
              )}
              <div className="history-footer">
                <Shield size={13} />
                <span>Your dictations are saved on this computer.</span>
                <button
                  onClick={() => {
                    setPage("Settings");
                    setSettingsTab("Data & Privacy");
                  }}
                >
                  Your privacy <ArrowUpRight size={12} />
                </button>
              </div>
            </>
          )}
          {(page === "Dictionary" || page === "Snippets") && (
            <>
              <div className="page-heading">
                <h1>{page}</h1>
                <button
                  className="button dark"
                  onClick={() =>
                    page === "Dictionary" ? addWord() : addSnippet()
                  }
                >
                  <Plus size={16} />
                  Add new {page === "Dictionary" ? "word" : "snippet"}
                </button>
              </div>
              <section
                className={
                  "hero library-hero " +
                  (page === "Snippets" ? "snippet-hero" : "")
                }
              >
                <h2>
                  {page === "Dictionary" ? (
                    <>
                      Your words.
                      <br />
                      <em>Understood.</em>
                    </>
                  ) : (
                    <>
                      Say a little.
                      <br />
                      <em>Write a lot.</em>
                    </>
                  )}
                </h2>
                <div>
                  <p>
                    {page === "Dictionary"
                      ? "Names, jargon, and all the words that make you, you. Teach Quill your vocabulary so every word sounds like you."
                      : "Save the things you type over and over. Just say your shortcut and let Quill fill in the rest."}
                  </p>
                  <span>
                    <CheckCircle2 size={14} />
                    {page === "Dictionary"
                      ? "Made for your vocabulary"
                      : "Your everyday words, on autopilot"}
                  </span>
                </div>
              </section>
              <div className="library-toolbar">
                <div className="tabs">
                  {["All", "Personal", "Shared with team"].map((t) => (
                    <button
                      key={t}
                      className={t === libraryTab ? "active" : ""}
                      onClick={() => setLibraryTab(t)}
                    >
                      {t}
                      {t === "All" && (
                        <small>
                          {page === "Dictionary"
                            ? dictionary.length
                            : snippets.length}
                        </small>
                      )}
                    </button>
                  ))}
                </div>
                <div className="toolbar-tools">
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      ref={searchRef}
                      aria-label={`Search ${page.toLowerCase()}`}
                      placeholder="Search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label className="sort-select">
                    <SlidersHorizontal size={15} />
                    <select
                      aria-label="Sort entries"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      {[
                        ...(page === "Dictionary" ? ["Starred first"] : []),
                        "Newest first",
                        "Oldest first",
                        "Alphabetical (A–Z)",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {libraryTab === "Shared with team" ? (
                <div className="empty-state">
                  <BookText size={32} />
                  <h3>Your own little library</h3>
                  <p>
                    This local workspace keeps your vocabulary personal.
                    <br />
                    Find your words and snippets in the Personal tab.
                  </p>
                  <button
                    className="button"
                    onClick={() => setLibraryTab("Personal")}
                  >
                    View personal entries
                  </button>
                </div>
              ) : entries.length ? (
                <div className="library-table">
                  <div className="library-table-head">
                    <span>
                      {page === "Dictionary"
                        ? "Word or phrase"
                        : "Spoken shortcut"}
                    </span>
                    <span>
                      {page === "Dictionary" ? "Correction" : "Expansion"}
                    </span>
                    <span />
                  </div>
                  {entries.map((entry) => (
                    <div key={entry.id} className="library-row">
                      <div>
                        {"word" in entry ? (
                          <>
                            <button
                              className={
                                "star-button " +
                                (entry.starred ? "starred" : "")
                              }
                              aria-label={`${entry.starred ? "Unstar" : "Star"} ${entry.word}`}
                              onClick={() =>
                                update(
                                  "dictionary",
                                  dictionary.map((w) =>
                                    w.id === entry.id
                                      ? { ...w, starred: !w.starred }
                                      : w,
                                  ),
                                )
                              }
                            >
                              <Star
                                size={14}
                                fill={entry.starred ? "currentColor" : "none"}
                              />
                            </button>
                            <strong>{entry.word}</strong>
                          </>
                        ) : (
                          <>
                            <Scissors size={15} />
                            <strong>{entry.trigger}</strong>
                          </>
                        )}
                      </div>
                      <p>
                        {"word" in entry ? (
                          entry.from ? (
                            <>
                              <span className="muted">“{entry.from}”</span>{" "}
                              <ArrowRight size={12} /> {entry.word}
                            </>
                          ) : (
                            <span className="muted">Added to vocabulary</span>
                          )
                        ) : (
                          entry.expansion
                        )}
                      </p>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${"word" in entry ? entry.word : entry.trigger}`}
                          onClick={() =>
                            "word" in entry ? addWord(entry) : addSnippet(entry)
                          }
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${"word" in entry ? entry.word : entry.trigger}`}
                          onClick={() => {
                            if ("word" in entry) {
                              const prev = dictionary;
                              update(
                                "dictionary",
                                dictionary.filter((w) => w.id !== entry.id),
                              );
                              notify("Word removed", () =>
                                update("dictionary", prev),
                              );
                            } else {
                              const prev = snippets;
                              update(
                                "snippets",
                                snippets.filter((s) => s.id !== entry.id),
                              );
                              notify("Snippet removed", () =>
                                update("snippets", prev),
                              );
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>
                    {search
                      ? "No results found"
                      : `Make ${page === "Dictionary" ? "yourself understood" : "space for your shortcuts"}`}
                  </h3>
                  <p>
                    {search
                      ? "Try a different word or clear your search."
                      : "Add your first entry to get started."}
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      search
                        ? setSearch("")
                        : page === "Dictionary"
                          ? addWord()
                          : addSnippet()
                    }
                  >
                    {search ? "Clear search" : "Add new"}
                  </button>
                </div>
              )}
              <p className="library-footnote">
                <Shield size={13} />
                Personal entries are saved on this device.
              </p>
            </>
          )}
          {page === "Style" && (
            <>
              <div className="page-heading">
                <h1>Style</h1>
                <span className="subtle-badge">Make yourself heard</span>
              </div>
              <section className="hero style-hero">
                <h2>
                  Your voice.
                  <br />
                  <em>Your way.</em>
                </h2>
                <p>
                  Sound like yourself, wherever you write.
                  <br />
                  Choose how Quill puts your thoughts into words.
                </p>
              </section>
              <div className="section-heading">
                <h2>Choose your writing style</h2>
                <span>Applied to your next dictation</span>
              </div>
              <div className="style-grid">
                {[
                  {
                    id: "formal",
                    name: "Formal",
                    description: "Polished and professional.",
                    text: "Hi, are you available for lunch tomorrow? Let’s meet at 12 if that works for you.",
                  },
                  {
                    id: "casual",
                    name: "Casual",
                    description: "Natural, with a little polish.",
                    text: "Hey, are you free for lunch tomorrow? Let’s do 12 if that works for you.",
                  },
                  {
                    id: "very-casual",
                    name: "Very casual",
                    description: "Just the way you say it.",
                    text: "hey are you free for lunch tomorrow? let’s do 12 if that works for you",
                  },
                ].map((s) => (
                  <button
                    className={
                      "style-card " + (settings.style === s.id ? "active" : "")
                    }
                    key={s.id}
                    onClick={() => changeSetting("style", s.id)}
                  >
                    <div>
                      <span
                        className={
                          "radio " + (settings.style === s.id ? "checked" : "")
                        }
                      />
                      <strong>{s.name}</strong>
                      {settings.style === s.id && (
                        <span className="selected-label">Selected</span>
                      )}
                    </div>
                    <p className="style-description">{s.description}</p>
                    <p className="style-example">{s.text}</p>
                  </button>
                ))}
              </div>
              <div className="setting-card">
                <div className="setting-row">
                  <span className="setting-icon">
                    <Sparkles size={20} />
                  </span>
                  <div>
                    <strong>Auto cleanup</strong>
                    <p>
                      Remove filler words, repeated words, and tidy up
                      punctuation.
                    </p>
                  </div>
                  <Toggle
                    value={settings.cleanup}
                    label="Auto cleanup"
                    onChange={(v) => changeSetting("cleanup", v)}
                  />
                </div>
              </div>
              <p className="small-print">
                Formal and Casual use sentence casing and punctuation. Very
                casual preserves your spoken casing.
              </p>
            </>
          )}
          {page === "Polish" && (
            <>
              <div className="page-heading">
                <h1>Polish</h1>
                <span className="subtle-badge">
                  <Sparkles size={12} /> A little clarity goes a long way
                </span>
              </div>
              <div className="editor-intro">
                <h2>
                  From a thought
                  <br />
                  to <em>just right.</em>
                </h2>
                <p>
                  Clean up your words with your dictionary,
                  <br />
                  snippets, and writing style.
                </p>
              </div>
              <div className="polish-grid">
                <div className="editor-card">
                  <div className="editor-label">
                    <span>Your words</span>
                    <span>{wordCount(polishInput)} words</span>
                  </div>
                  <textarea
                    aria-label="Text to polish"
                    placeholder="Type or paste something here…"
                    value={polishInput}
                    onChange={(e) => setPolishInput(e.target.value)}
                  />
                  <div className="editor-bottom">
                    <button
                      className="text-button"
                      onClick={() => setPolishInput("")}
                    >
                      Clear
                    </button>
                    <button
                      className="button dark"
                      disabled={!polishInput.trim()}
                      onClick={() =>
                        setPolishOutput(
                          polishText(polishInput, {
                            dictionary,
                            snippets,
                            style: settings.style,
                            cleanup: settings.cleanup,
                          }),
                        )
                      }
                    >
                      <Sparkles size={15} />
                      Polish text
                    </button>
                  </div>
                </div>
                <div className="editor-card result-card">
                  <div className="editor-label">
                    <span>
                      <Sparkles size={13} /> All polished
                    </span>
                    {polishOutput && (
                      <button
                        className="icon-button"
                        aria-label="Copy polished text"
                        onClick={() => copy(polishOutput)}
                      >
                        <Copy size={15} />
                      </button>
                    )}
                  </div>
                  {polishOutput ? (
                    <p className="polished-text">{polishOutput}</p>
                  ) : (
                    <div className="polish-placeholder">
                      <Sparkles size={29} />
                      <p>A clearer version, coming right up.</p>
                    </div>
                  )}
                  <div className="editor-bottom">
                    <span className="muted">
                      {settings.style.replace("very-casual", "Very casual")}{" "}
                      style
                    </span>
                    {polishOutput && (
                      <button
                        className="text-button"
                        onClick={() => newNote(polishOutput)}
                      >
                        Save as note <ArrowUpRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p className="small-print">
                Local cleanup handles fillers, repetitions, spoken punctuation,
                and your saved vocabulary. It does not rewrite meaning.
              </p>
            </>
          )}
          {page === "Notes" && (
            <>
              <div className="page-heading">
                <h1>Notes</h1>
                <button className="button dark" onClick={() => newNote()}>
                  <Plus size={16} />
                  New note
                </button>
              </div>
              <div className="notes-workspace">
                <div className="notes-list">
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      ref={searchRef}
                      placeholder="Search notes"
                      aria-label="Search notes"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {notes
                    .filter((n) =>
                      (n.title + n.body)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((n) => (
                      <button
                        key={n.id}
                        className={
                          "note-list-item " +
                          (selectedNote === n.id ? "active" : "")
                        }
                        onClick={() => setSelectedNote(n.id)}
                      >
                        <strong>{n.title || "Untitled note"}</strong>
                        <p>
                          {n.body.slice(0, 66) ||
                            "A fresh space for your thoughts…"}
                        </p>
                        <span>{dateLabel(n.updatedAt)}</span>
                      </button>
                    ))}
                </div>
                {notes.find((n) => n.id === selectedNote) ? (
                  (() => {
                    const n = notes.find((n) => n.id === selectedNote)!;
                    return (
                      <div className="note-editor">
                        <div className="note-editor-tools">
                          <span>Saved on this device</span>
                          <button
                            className="icon-button"
                            aria-label="Copy note"
                            onClick={() => copy(n.title + "\n\n" + n.body)}
                          >
                            <Copy size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Delete note"
                            onClick={() => {
                              const prev = notes;
                              update(
                                "notes",
                                notes.filter((note) => note.id !== n.id),
                              );
                              setSelectedNote(null);
                              notify("Note removed", () =>
                                update("notes", prev),
                              );
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <input
                          aria-label="Note title"
                          placeholder="Untitled note"
                          value={n.title}
                          onChange={(e) =>
                            update(
                              "notes",
                              notes.map((note) =>
                                note.id === n.id
                                  ? {
                                      ...note,
                                      title: e.target.value,
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : note,
                              ),
                            )
                          }
                        />
                        <textarea
                          aria-label="Note body"
                          placeholder="Let your thoughts flow…"
                          value={n.body}
                          onChange={(e) =>
                            update(
                              "notes",
                              notes.map((note) =>
                                note.id === n.id
                                  ? {
                                      ...note,
                                      body: e.target.value,
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : note,
                              ),
                            )
                          }
                        />
                      </div>
                    );
                  })()
                ) : (
                  <div className="empty-state notes-empty">
                    <StickyNote size={37} />
                    <h3>A little space to think.</h3>
                    <p>
                      Capture an idea. Start a draft.
                      <br />
                      Let a thought become something.
                    </p>
                    <button className="button" onClick={() => newNote()}>
                      Create your first note <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {page === "Insights" && (
            <>
              <div className="page-heading">
                <h1>Your insights</h1>
                <button className="text-button" onClick={() => setPage("Home")}>
                  <ArrowLeft size={15} />
                  Back to home
                </button>
              </div>
              <div className="insights-hero">
                <span>LESS TYPING. MORE YOU.</span>
                <h2>
                  Look at you <em>write.</em>
                </h2>
                <p>Every word is a little more time back in your day.</p>
              </div>
              <div className="insight-cards">
                {[
                  {
                    icon: BookText,
                    label: "Words dictated",
                    value: totalWords.toLocaleString(),
                    suffix: "your thoughts, captured",
                  },
                  {
                    icon: TrendingUp,
                    label: "Speaking speed",
                    value: wpm + " WPM",
                    suffix: "your natural pace",
                  },
                  {
                    icon: Clock,
                    label: "Time saved",
                    value:
                      Math.max(
                        0,
                        Math.round(totalWords / 40 - totalTime / 60),
                      ) + " min",
                    suffix: "compared to typing at 40 WPM",
                  },
                ].map((s) => (
                  <div className="insight-card" key={s.label}>
                    <s.icon size={21} />
                    <p>{s.label}</p>
                    <strong>{s.value}</strong>
                    <small>{s.suffix}</small>
                  </div>
                ))}
              </div>
              <div className="setting-card">
                <div className="section-heading">
                  <h2>Where you write</h2>
                  <span>{realHistory.length} dictations</span>
                </div>
                {realHistory.length ? (
                  Object.entries(
                    realHistory.reduce<Record<string, number>>((apps, h) => {
                      apps[h.app] = (apps[h.app] || 0) + h.words;
                      return apps;
                    }, {}),
                  ).map(([app, words]) => (
                    <div className="app-stat" key={app}>
                      <AppIcon name={app} />
                      <span>{app}</span>
                      <div>
                        <i
                          style={{
                            width:
                              Math.max(4, (words / totalWords) * 100) + "%",
                          }}
                        />
                      </div>
                      <strong>{words} words</strong>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Mic size={28} />
                    <h3>Your story starts with a word.</h3>
                    <p>
                      Start dictating to see your own insights here.
                      <br />
                      Sample dictations are excluded from your statistics.
                    </p>
                    <button className="button" onClick={record}>
                      Start dictating
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {page === "Settings" && (
            <Modal title="Settings" className="settings-dialog" onClose={() => setPage("Home")}>
              <div className="settings-layout">
                <nav className="settings-nav">
                  {["General", "System", "Account", "Data & Privacy"].map(
                    (t) => (
                      <button
                        className={settingsTab === t ? "active" : ""}
                        key={t}
                        onClick={() => setSettingsTab(t)}
                      >
                        {t}
                        <ChevronRight size={13} />
                      </button>
                    ),
                  )}
                </nav>
                <div className="settings-body">
                  <h2>{settingsTab}</h2>
                  {settingsTab === "General" && (
                    <>
                      <div className="setting-card">
                        <div className="setting-row">
                          <span className="setting-icon"><Sun size={20} /></span>
                          <div>
                            <strong>Appearance</strong>
                            <p>Choose a theme or follow your system.</p>
                          </div>
                          <select aria-label="Appearance" value={settings.theme || "light"}
                            onChange={(e) => changeSetting("theme", e.target.value as Settings["theme"])}>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                            <option value="system">System</option>
                          </select>
                        </div>
                        <div className="setting-row">
                          <span className="setting-icon">
                            <Keyboard size={20} />
                          </span>
                          <div>
                            <strong>Dictation shortcut</strong>
                            <p>Start and stop dictation from anywhere.</p>
                          </div>
                          <select
                            aria-label="Dictation shortcut"
                            value={settings.shortcut}
                            onChange={async (e) => {
                              const value = e.target.value;
                              if (
                                window.flow &&
                                !(await window.flow.invoke(
                                  "shortcut:set",
                                  value,
                                ))
                              ) {
                                notify("That shortcut is in use. Try another.");
                                return;
                              }
                              changeSetting("shortcut", value);
                              notify("Shortcut updated");
                            }}
                          >
                            <option value="CommandOrControl+Shift+Space">
                              {isWindows ? "Ctrl Shift Space" : "⌘ ⇧ Space"}
                            </option>
                            <option value="Control+Alt+Space">{isWindows ? "Ctrl Alt Space" : "⌃ ⌥ Space"}</option>
                            <option value="CommandOrControl+Shift+D">
                              {isWindows ? "Ctrl Shift D" : "⌘ ⇧ D"}
                            </option>
                          </select>
                        </div>
                        <div className="setting-row">
                          <span className="setting-icon">
                            <Mic size={20} />
                          </span>
                          <div>
                            <strong>Microphone</strong>
                            <p>Uses your computer’s default input device.</p>
                          </div>
                          <span className="subtle-badge">System default</span>
                        </div>
                        <div className="setting-row">
                          <span className="setting-icon">
                            <Globe size={20} />
                          </span>
                          <div>
                            <strong>Language</strong>
                            <p>Choose the language you speak.</p>
                          </div>
                          <select
                            aria-label="Dictation language"
                            value={settings.language}
                            onChange={(e) =>
                              changeSetting("language", e.target.value)
                            }
                          >
                            {Object.entries({
                              "en-AU": "English (Australia)",
                              "en-US": "English (US)",
                              "en-GB": "English (UK)",
                              "fr-FR": "Français",
                              "de-DE": "Deutsch",
                              "es-ES": "Español",
                              "it-IT": "Italiano",
                              "pt-BR": "Português",
                              "ja-JP": "日本語",
                              "ko-KR": "한국어",
                              "zh-CN": "中文",
                              "ar-SA": "العربية",
                              "hi-IN": "हिन्दी",
                            }).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="setting-card">
                        <div className="setting-row">
                          <span className="setting-icon">
                            <Copy size={20} />
                          </span>
                          <div>
                            <strong>Paste into the active app</strong>
                            <p>
                              Insert your words where your cursor was.
                              <br />
                              {isWindows ? "Pastes with Ctrl+V into the original app." : "Requires macOS Accessibility permission."}
                            </p>
                          </div>
                          <Toggle
                            value={settings.autoPaste}
                            label="Paste into the active app"
                            onChange={(v) => changeSetting("autoPaste", v)}
                          />
                        </div>
                        <div className="setting-row">
                          <span className="setting-icon">
                            <Sparkles size={20} />
                          </span>
                          <div>
                            <strong>Auto cleanup</strong>
                            <p>Remove fillers and tidy up punctuation.</p>
                          </div>
                          <Toggle
                            value={settings.cleanup}
                            label="Auto cleanup"
                            onChange={(v) => changeSetting("cleanup", v)}
                          />
                        </div>
                      </div>
                      <div className="engine-note">
                        <Shield size={17} />
                        <p>
                          <strong>{isWindows ? "Powered by Windows Speech" : "Powered by Apple Speech"}</strong>
                          <br />
                          {isWindows ? "Recognition uses an installed Windows speech language and runs locally. Dictionary corrections and snippets apply after transcription." : <>Recognition runs on device when supported. Apple’s
                          speech service may be used if local recognition is
                          unavailable.
                        </>}</p>
                      </div>
                    </>
                  )}
                  {settingsTab === "System" && (
                    <>
                      <div className="setting-card">
                        <div className="setting-row">
                          <span className="setting-icon">
                            <Mic size={20} />
                          </span>
                          <div>
                            <strong>Show Quill Bar</strong>
                            <p>Keep the shortcut visible when not dictating.</p>
                          </div>
                          <Toggle
                            value={settings.showBar}
                            label="Show Quill Bar"
                            onChange={(v) => changeSetting("showBar", v)}
                          />
                        </div>
                      </div>
                      <h3 className="settings-subheading">{isWindows ? "Windows speech and microphone" : "macOS permissions"}</h3>
                      {[
                        {
                          title: "Microphone",
                          text: "Capture your voice when you start dictating.",
                          kind: "microphone",
                        },
                        {
                          title: "Speech Recognition",
                          text: isWindows ? "Uses an installed Windows speech recognition language." : "Turn your voice into text with Apple Speech.",
                          kind: "speech",
                        },
                        {
                          title: "Accessibility",
                          text: "Paste dictated words into your other apps.",
                          kind: "accessibility",
                        },
                      ].filter(p => !isWindows || p.kind !== "accessibility").map((p) => (
                        <div
                          className="setting-row permission-row"
                          key={p.kind}
                        >
                          <div>
                            <strong>{p.title}</strong>
                            <p>{p.text}</p>
                            {permissions && (
                              <p
                                className={
                                  p.kind === "accessibility" &&
                                  !permissions.accessibility
                                    ? "permission-status missing"
                                    : "permission-status"
                                }
                              >
                                {p.kind === "accessibility"
                                  ? permissions.accessibility
                                    ? "Enabled for this copy of Quill"
                                    : "Not granted to this copy of Quill"
                                  : (p.kind === "microphone"
                                        ? permissions.microphone
                                        : permissions.speech) === "authorized"
                                    ? "Enabled"
                                    : isWindows && p.kind === "microphone" ? "Checked when dictation starts" : "Not enabled"}
                              </p>
                            )}
                          </div>
                          <button
                            className="button"
                            onClick={() =>
                              window.flow
                                ? window.flow.invoke(
                                    "settings:open-permissions",
                                    p.kind,
                                  )
                                : notify(
                                    "Open the desktop app to manage permissions.",
                                  )
                            }
                          >
                            Open Settings <ArrowUpRight size={13} />
                          </button>
                        </div>
                      ))}
                      {window.flow && (
                        <div className="permission-actions">
                          <button
                            className="button"
                            disabled={checkingPermissions}
                            onClick={checkPermissions}
                          >
                            <RefreshCw size={14} />
                            {checkingPermissions
                              ? "Checking…"
                              : "Recheck access"}
                          </button>
                          <button
                            className="button"
                            onClick={() =>
                              window.flow?.invoke("settings:locate-app")
                            }
                          >
                            Locate this Quill app <ArrowUpRight size={13} />
                          </button>
                        </div>
                      )}
                      {!isWindows && permissions && !permissions.accessibility && (
                        <div className="engine-note">
                          <Shield size={18} />
                          <p>
                            A checked Quill entry can belong to an earlier copy.
                            In macOS Accessibility settings, remove the old
                            entry with the minus button, then add the Quill app
                            selected by “Locate this Quill app” and enable it.
                            Quit and reopen Quill if Recheck access still says
                            it is not granted.
                          </p>
                        </div>
                      )}
                      <p className="small-print">
                        Permissions are requested only when you start dictating.
                        You stay in control.
                      </p>
                    </>
                  )}
                  {settingsTab === "Account" && (
                    <>
                      <div className="account-avatar">
                        {settings.name?.slice(0, 1).toUpperCase() || (
                          <UserCircle size={35} />
                        )}
                      </div>
                      <h3>Make yourself at home.</h3>
                      <p className="muted">
                        This is your personal, local workspace.
                      </p>
                      <label className="field">
                        <span>Your name</span>
                        <input
                          aria-label="Your name"
                          placeholder="What should we call you?"
                          value={settings.name}
                          onChange={(e) =>
                            changeSetting("name", e.target.value)
                          }
                        />
                      </label>
                      <div className="engine-note">
                        <Shield size={20} />
                        <p>
                          Your workspace stays on this computer. No account or
                          subscription is required for this local build.
                        </p>
                      </div>
                    </>
                  )}
                  {settingsTab === "Data & Privacy" && (
                    <>
                      <div className="setting-card">
                        <div className="setting-row">
                          <span className="setting-icon">
                            <Shield size={21} />
                          </span>
                          <div>
                            <strong>Your history stays here</strong>
                            <p>
                              Dictations, notes, dictionary, and snippets are
                              <br />
                              saved locally. Audio recordings are not saved.
                            </p>
                          </div>
                          <span className="privacy-tag">
                            <Check size={13} />
                            Local storage
                          </span>
                        </div>
                      </div>
                      <div className="setting-row permission-row">
                        <div>
                          <strong>Export dictation history</strong>
                          <p>Take a copy of your words with you.</p>
                        </div>
                        <button
                          className="button"
                          onClick={async () => {
                            if (window.flow) {
                              if (await window.flow.invoke("history:export"))
                                notify("History exported");
                            } else {
                              const blob = new Blob(
                                [JSON.stringify(history, null, 2)],
                                { type: "application/json" },
                              );
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = "Quill dictations.json";
                              a.click();
                              setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }
                          }}
                        >
                          <Download size={14} />
                          Export
                        </button>
                      </div>
                      <div className="engine-note">
                        <HelpCircle size={19} />
                        <p>
                          {isWindows ? "Windows speech recognition runs locally. No audio is saved by Quill." : <>Apple may process audio when on-device speech
                          recognition is unavailable. This build does not
                          connect to Wispr’s servers.
                        </>}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Modal>
          )}
          {page === "Help" && (
            <>
              <div className="page-heading">
                <h1>A little help to find your words.</h1>
              </div>
              <section className="hero help-hero">
                <h2>
                  It starts with
                  <br />
                  <em>your voice.</em>
                </h2>
                <button
                  className="button cream"
                  onClick={() => setModal("how")}
                >
                  Get started <ArrowUpRight size={14} />
                </button>
              </section>
              <div className="help-grid">
                {[
                  {
                    icon: Mic,
                    title: "Your first dictation",
                    text: "A thought, a shortcut, and you’re off.",
                    action: () => setModal("how"),
                  },
                  {
                    icon: Keyboard,
                    title: "Keyboard shortcuts",
                    text: "Put your words to work a little faster.",
                    action: () => setModal("shortcuts"),
                  },
                  {
                    icon: BookText,
                    title: "Teach Quill your words",
                    text: "Names and phrases, exactly your way.",
                    action: () => setPage("Dictionary"),
                  },
                  {
                    icon: Shield,
                    title: "Permissions & privacy",
                    text: "Understand what stays on your device.",
                    action: () => {
                      setPage("Settings");
                      setSettingsTab("System");
                    },
                  },
                ].map((h) => (
                  <button
                    key={h.title}
                    className="help-card"
                    onClick={h.action}
                  >
                    <h.icon size={22} />
                    <h3>{h.title}</h3>
                    <p>{h.text}</p>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
              <p className="small-print">
                Quill is an independent desktop recreation.{" "}
                <a
                  href="https://docs.wisprflow.ai/"
                  target="_blank"
                  rel="noreferrer"
                >
                  View the original product’s help center{" "}
                  <ArrowUpRight size={11} />
                </a>
              </p>
            </>
          )}
        </div>
      </main>
      {!overlay && (
        <div className={"recorder-dock " + (active ? "active" : "")}>
          <button
            className="dock-mic"
            aria-label={active ? "Stop dictation" : "Start dictation"}
            onClick={record}
          >
            {active ? (
              <Square size={13} fill="currentColor" />
            ) : (
              <Mic size={17} />
            )}
          </button>
          <div>
            <strong>
              {active
                ? speech.status === "processing"
                  ? "Finishing up…"
                  : speech.status === "starting"
                    ? "Connecting…"
                    : "Listening…"
                : "Ready when you are"}
            </strong>
            <span>
              {active
                ? speech.text || "Go ahead. Let your thoughts flow."
                : "Your voice, a little less friction."}
            </span>
          </div>
          <Shortcut small value={settings.shortcut} />
          {active && (
            <button
              className="icon-button"
              aria-label="Cancel recording"
              onClick={() => window.flow?.invoke("speech:cancel")}
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {speech.error && (
        <div className="speech-error">
          <Mic size={18} />
          <div>
            <strong>Let’s get your words moving</strong>
            <p>{speech.error}</p>
          </div>
          <button
            className="button"
            onClick={() => {
              setPage("Settings");
              setSettingsTab("System");
              setSpeech({ ...speech, error: "" });
            }}
          >
            Settings
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss speech error"
            onClick={() => setSpeech({ ...speech, error: "" })}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
          {undo && (
            <button
              onClick={() => {
                undo();
                setToast("Restored");
                setUndo(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
      {modal === "word" && (
        <Modal
          title={editingWord ? "Edit word" : "Add a new word"}
          onClose={() => setModal(null)}
        >
          <p className="modal-description">
            A name, a little jargon, or a word that’s uniquely yours.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveWord();
            }}
          >
            <label className="field">
              <span>Word or phrase</span>
              <input
                autoFocus
                maxLength={200}
                value={draftWord}
                onChange={(e) => setDraftWord(e.target.value)}
                placeholder="e.g. Quill"
              />
            </label>
            <label className="field">
              <span>
                Correct a misspelling <small>Optional</small>
              </span>
              <input
                maxLength={200}
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                placeholder="e.g. kwill"
              />
            </label>
            <p className="field-hint">
              When you say the misspelling, Quill uses your preferred word.
            </p>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="button dark" type="submit">
                {editingWord ? "Save changes" : "Add word"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "snippet" && (
        <Modal
          title={editingSnippet ? "Edit snippet" : "Create a snippet"}
          onClose={() => setModal(null)}
        >
          <p className="modal-description">
            A shortcut for the things you say all the time.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSnippet();
            }}
          >
            <label className="field">
              <span>Spoken shortcut</span>
              <input
                autoFocus
                maxLength={60}
                value={draftTrigger}
                onChange={(e) => setDraftTrigger(e.target.value)}
                placeholder="e.g. my email signature"
              />
            </label>
            <label className="field">
              <span>Expansion</span>
              <textarea
                rows={5}
                maxLength={4000}
                value={draftExpansion}
                onChange={(e) => setDraftExpansion(e.target.value)}
                placeholder="The text you want Quill to write…"
              />
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="button dark" type="submit">
                {editingSnippet ? "Save changes" : "Add snippet"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {(modal === "how" || modal === "dictate") && (
        <Modal
          title={modal === "how" ? "Find your words" : "Ready to give it a go?"}
          onClose={() => setModal(null)}
        >
          <div className="how-icon">
            <Mic size={30} />
          </div>
          <h3 className="modal-serif">Think it. Say it. Done.</h3>
          <div className="how-steps">
            {[
              {
                title: "Put your cursor anywhere",
                text: "Open a message, email, document, or note.",
              },
              {
                title: "Press " + shortcutKeys(settings.shortcut).join(" + "),
                text: "Start speaking naturally. No need to be perfect.",
              },
              {
                title: "Press the shortcut again",
                text: "Your words appear, cleaned up and ready to go.",
              },
            ].map((s, i) => (
              <div key={s.title}>
                <span>{i + 1}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
          {!window.flow && (
            <p className="preview-note">
              You’re in the browser preview. Real microphone dictation and
              typing into other apps work in the Quill desktop app.
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button"
              onClick={() => {
                setDemoResult("");
                setModal("demo");
              }}
            >
              Try a sample
            </button>
            <button
              className="button dark"
              onClick={() => {
                setModal(null);
                window.flow
                  ? record()
                  : notify(
                      "Open Quill.app from the release folder for real dictation.",
                    );
              }}
            >
              {window.flow ? "Start dictating" : "Got it"}
              <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}
      {modal === "demo" && (
        <Modal
          title="A little taste of Quill"
          onClose={() => setModal(null)}
          wide
        >
          <p className="modal-description">
            Try this editable sample. Quill removes fillers, uses your
            vocabulary, and expands snippets.
          </p>
          <label className="field">
            <span>Imagine saying…</span>
            <textarea
              rows={4}
              aria-label="Sample speech"
              value={demoRaw}
              onChange={(e) => {
                setDemoRaw(e.target.value);
                setDemoResult("");
              }}
            />
          </label>
          {demoResult && (
            <div className="demo-result">
              <span>
                <Sparkles size={14} /> And out comes…
              </span>
              <p>{demoResult}</p>
              <button className="text-button" onClick={() => copy(demoResult)}>
                Copy text <Copy size={13} />
              </button>
            </div>
          )}
          <div className="modal-actions">
            <span className="muted">Sample · no microphone needed</span>
            <button
              className="button dark"
              disabled={!demoRaw.trim()}
              onClick={() =>
                setDemoResult(
                  polishText(demoRaw, {
                    dictionary,
                    snippets,
                    style: settings.style,
                    cleanup: settings.cleanup,
                  }),
                )
              }
            >
              <Sparkles size={15} />
              See Quill write
            </button>
          </div>
        </Modal>
      )}
      {modal === "shortcuts" && (
        <Modal title="A shortcut to your words" onClose={() => setModal(null)}>
          <div className="shortcut-row">
            <span>Start / stop dictation</span>
            <Shortcut small value={settings.shortcut} />
          </div>
          <div className="shortcut-row">
            <span>Search this page</span>
            <span className="shortcut small">
              <kbd>{isWindows ? "Ctrl" : "⌘"}</kbd>
              <kbd>F</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>Browse dictation history</span>
            <span className="shortcut small">
              <kbd>↑</kbd>
              <kbd>↓</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>Cancel recording / close dialog</span>
            <span className="shortcut small">
              <kbd>Esc</kbd>
            </span>
          </div>
          <div className="modal-actions">
            <button
              className="button"
              onClick={() => {
                setModal(null);
                setPage("Settings");
                setSettingsTab("General");
              }}
            >
              Customize shortcut <ArrowUpRight size={13} />
            </button>
          </div>
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal title="You’re all caught up" onClose={() => setModal(null)}>
          <div className="empty-state">
            <Bell size={32} />
            <h3>A little peace and quiet.</h3>
            <p>Nothing new here. Go make something great.</p>
          </div>
        </Modal>
      )}
      {modal === "about" && (
        <Modal
          title="Your voice. A little magic."
          onClose={() => setModal(null)}
        >
          <div className="about-logo">
            <Logo />
          </div>
          <p className="modal-description">
            An independent, local recreation of the Wispr Flow desktop
            experience. Built for the words you haven’t written yet.
          </p>
          <p className="preview-note">
            Native speech recognition, a global shortcut, personal
            vocabulary, snippets, and local history. This build is not connected
            to Wispr’s private AI or cloud services.
          </p>
          <div className="modal-actions">
            <button className="button dark" onClick={() => setModal(null)}>
              Make something great <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title="Your dictation" onClose={() => setDetail(null)} wide>
          <div className="dictation-meta">
            <AppIcon name={detail.app} />
            {detail.app}
            <i /> {dateLabel(detail.createdAt)} at {time(detail.createdAt)}{" "}
            <i />
            {detail.words} words
            {detail.sample && <span className="subtle-badge">Sample</span>}
          </div>
          <div className="dictation-detail">{detail.text}</div>
          <details className="raw-details">
            <summary>
              Original transcript <ChevronDown size={13} />
            </summary>
            <p>{detail.raw}</p>
          </details>
          <div className="modal-actions">
            <button
              className="icon-button danger"
              aria-label="Remove dictation"
              onClick={() => {
                const prev = history;
                update(
                  "history",
                  history.filter((h) => h.id !== detail.id),
                );
                setDetail(null);
                notify("Dictation removed", () => update("history", prev));
              }}
            >
              <Trash2 size={17} />
            </button>
            <div>
              <button
                className="button"
                onClick={() => {
                  newNote(detail.text);
                  setDetail(null);
                }}
              >
                <StickyNote size={14} />
                Save as note
              </button>
              <button className="button dark" onClick={() => copy(detail.text)}>
                <Copy size={14} />
                Copy text
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default App;
