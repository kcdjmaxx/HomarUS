import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme, type ThemePalette } from "../theme";
import { registerSkill, type ViewProps } from "../skills-registry";

// --- Types ---

interface JournalEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: string;
  private: boolean;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  emotions: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

interface JournalStats {
  totalEntries: number;
  currentStreak: number;
  longestStreak: number;
  averageMood: number;
  recentEmotions: Record<string, number>;
  entriesByCategory: Record<string, number>;
}

type ViewMode = "list" | "editor";

const API = "/api/journal";

const CATEGORIES = ["personal", "idea", "reflection", "work", "creative", "health", "relationship"] as const;

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#4ade80",
  neutral: "#8888a0",
  negative: "#f87171",
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: "+",
  neutral: "~",
  negative: "-",
};

const CATEGORY_COLORS: Record<string, string> = {
  personal: "#c4b5fd",
  idea: "#f59e0b",
  reflection: "#60a5fa",
  work: "#34d399",
  creative: "#f472b6",
  health: "#4ade80",
  relationship: "#fb923c",
};

// --- Main component ---

export function JournalView(_props: ViewProps) {
  const { theme } = useTheme();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [mode, setMode] = useState<ViewMode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [statsExpanded, setStatsExpanded] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formCategory, setFormCategory] = useState<string>("personal");
  const [formPrivate, setFormPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`${API}/entries`);
      setEntries(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchStats();
    const interval = setInterval(() => { fetchEntries(); fetchStats(); }, 15_000);
    return () => clearInterval(interval);
  }, [fetchEntries, fetchStats]);

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormTags("");
    setFormCategory("personal");
    setFormPrivate(false);
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setMode("editor");
  };

  const openEdit = (entry: JournalEntry) => {
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setFormTags(entry.tags.join(", "));
    setFormCategory(entry.category);
    setFormPrivate(entry.private);
    setEditingId(entry.id);
    setMode("editor");
  };

  const saveEntry = async () => {
    if (!formContent.trim()) return;
    setSaving(true);
    const body = {
      title: formTitle || undefined,
      content: formContent,
      tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
      category: formCategory,
      private: formPrivate,
    };

    try {
      if (editingId) {
        await fetch(`${API}/entries/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch(`${API}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      resetForm();
      setMode("list");
      fetchEntries();
      fetchStats();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    await fetch(`${API}/entries/${id}`, { method: "DELETE" });
    fetchEntries();
    fetchStats();
  };

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q));
    const matchCategory = !filterCategory || e.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const allCategories = Array.from(new Set(entries.map((e) => e.category))).sort();

  // --- Editor view ---
  if (mode === "editor") {
    return (
      <EditorView
        theme={theme}
        title={formTitle} setTitle={setFormTitle}
        content={formContent} setContent={setFormContent}
        tags={formTags} setTags={setFormTags}
        category={formCategory} setCategory={setFormCategory}
        isPrivate={formPrivate} setPrivate={setFormPrivate}
        saving={saving}
        isEditing={!!editingId}
        onSave={saveEntry}
        onBack={() => { resetForm(); setMode("list"); }}
      />
    );
  }

  // --- List view ---
  return (
    <div style={{ padding: 20, height: "100%", overflow: "auto", display: "flex", flexDirection: "column" as const }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.text }}>Journal</h2>
        <span style={{ fontSize: 12, color: theme.textMuted }}>{entries.length} entries</span>
        <button
          style={{
            marginLeft: "auto", background: theme.buttonBg, border: "none",
            borderRadius: 6, color: theme.buttonText, cursor: "pointer",
            fontSize: 12, padding: "6px 16px", fontFamily: "inherit", fontWeight: 600,
          }}
          onClick={openNew}
        >+ New Entry</button>
      </div>

      {/* Stats panel */}
      {stats && stats.totalEntries > 0 && (
        <StatsPanel stats={stats} expanded={statsExpanded} onToggle={() => setStatsExpanded(!statsExpanded)} theme={theme} />
      )}

      {/* Search + category filter */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 16 }}>
        <input
          style={{
            background: theme.surface, border: `1px solid ${theme.border}`,
            borderRadius: 8, color: theme.text, padding: "10px 14px",
            fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
          placeholder="Search entries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {allCategories.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            <button
              style={{
                background: filterCategory === null ? theme.border : "none",
                border: `1px solid ${filterCategory === null ? theme.accentSubtle : theme.inputBorder}`,
                borderRadius: 12, color: filterCategory === null ? theme.accent : theme.textMuted,
                cursor: "pointer", fontSize: 11, padding: "3px 10px", fontFamily: "inherit",
              }}
              onClick={() => setFilterCategory(null)}
            >All</button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                style={{
                  background: filterCategory === cat ? theme.border : "none",
                  border: `1px solid ${CATEGORY_COLORS[cat] ?? theme.inputBorder}`,
                  borderRadius: 12, color: filterCategory === cat ? theme.accent : theme.textMuted,
                  cursor: "pointer", fontSize: 11, padding: "3px 10px", fontFamily: "inherit",
                }}
                onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
              >{cat}</button>
            ))}
          </div>
        )}
      </div>

      {/* Entry list */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, flex: 1, overflow: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ color: theme.textMuted, fontSize: 13, padding: "40px 0", textAlign: "center" as const }}>
            {entries.length === 0 ? "No journal entries yet. Write your first one." : "No matches."}
          </div>
        )}
        {filtered.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            theme={theme}
            onEdit={() => openEdit(entry)}
            onDelete={() => deleteEntry(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

// --- Stats panel ---

function StatsPanel({ stats, expanded, onToggle, theme }: {
  stats: JournalStats;
  expanded: boolean;
  onToggle: () => void;
  theme: ThemePalette;
}) {
  const moodDisplay = (stats.averageMood * 10).toFixed(1);
  const topEmotions = Object.entries(stats.recentEmotions)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  return (
    <div style={{
      background: theme.surface, borderRadius: 10,
      border: `1px solid ${theme.border}`, marginBottom: 16,
      overflow: "hidden",
    }}>
      <button
        style={{
          width: "100%", background: "none", border: "none",
          color: theme.text, cursor: "pointer", fontFamily: "inherit",
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 16,
          textAlign: "left" as const,
        }}
        onClick={onToggle}
      >
        <span style={{ display: "inline-block", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", fontSize: 10, color: theme.textMuted }}>&#9660;</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Stats</span>
        <span style={{ fontSize: 12, color: theme.textMuted }}>
          {stats.totalEntries} entries | {stats.currentStreak}d streak | mood {moodDisplay}/10
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 16px 14px", display: "flex", gap: 20, flexWrap: "wrap" as const }}>
          <StatBox label="Total" value={String(stats.totalEntries)} theme={theme} />
          <StatBox label="Streak" value={`${stats.currentStreak}d`} theme={theme} />
          <StatBox label="Best" value={`${stats.longestStreak}d`} theme={theme} />
          <StatBox label="Mood" value={moodDisplay} theme={theme} />
          {topEmotions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 10, color: theme.textFaint, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Top emotions</span>
              <div style={{ display: "flex", gap: 8 }}>
                {topEmotions.map(([emotion, intensity]) => (
                  <span key={emotion} style={{ fontSize: 11, color: theme.accent }}>
                    {emotion} <span style={{ color: theme.textMuted }}>{Math.round(intensity)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, theme }: { label: string; value: string; theme: ThemePalette }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
      <span style={{ fontSize: 10, color: theme.textFaint, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{value}</span>
    </div>
  );
}

// --- Entry card ---

function EntryCard({ entry, theme, onEdit, onDelete }: {
  entry: JournalEntry;
  theme: ThemePalette;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const date = new Date(entry.createdAt);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const contentPreview = entry.content.slice(0, 140).replace(/\n/g, " ");
  const sentimentColor = SENTIMENT_COLORS[entry.sentiment] ?? SENTIMENT_COLORS.neutral;

  const topEmotions = Object.entries(entry.emotions ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <div
      style={{
        display: "flex", flexDirection: "column" as const, padding: "14px 16px",
        background: theme.surface,
        border: `1px solid ${entry.private ? theme.warningSubtle : theme.border}`,
        borderRadius: 10, cursor: "pointer", fontFamily: "inherit", color: theme.text,
        position: "relative" as const,
      }}
      onClick={() => onEdit()}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Top row: date, title, sentiment, private */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: theme.textFaint, flexShrink: 0 }}>{dateStr} {timeStr}</span>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {entry.title || "Untitled"}
        </span>
        {entry.private && (
          <span style={{ fontSize: 11, color: theme.warning, flexShrink: 0 }} title="Private entry">&#9919;</span>
        )}
        <span style={{
          fontSize: 11, fontWeight: 600, color: sentimentColor, flexShrink: 0,
          border: `1px solid ${sentimentColor}`, borderRadius: 8, padding: "1px 8px",
        }}>
          {SENTIMENT_EMOJI[entry.sentiment]} {(entry.sentimentScore * 10).toFixed(0)}
        </span>
      </div>

      {/* Content preview */}
      <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
        {contentPreview}{entry.content.length > 140 ? "..." : ""}
      </div>

      {/* Bottom row: tags, emotions, category */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
        <span style={{
          fontSize: 10, fontWeight: 500,
          color: CATEGORY_COLORS[entry.category] ?? theme.textFaint,
          textTransform: "uppercase" as const, letterSpacing: 0.5,
        }}>{entry.category}</span>
        {entry.tags.slice(0, 3).map((tag) => (
          <span key={tag} style={{ fontSize: 10, color: theme.textFaint, borderRadius: 8, border: `1px solid ${theme.borderSubtle}`, padding: "1px 6px" }}>
            {tag}
          </span>
        ))}
        {topEmotions.length > 0 && (
          <span style={{ fontSize: 10, color: theme.accent, marginLeft: "auto" }}>
            {topEmotions.map(([e, v]) => `${e} ${v}`).join("  ")}
          </span>
        )}
      </div>

      {/* Hover actions */}
      {showActions && (
        <button
          style={{
            position: "absolute" as const, top: 8, right: 8,
            background: theme.border, border: `1px solid ${theme.inputBorder}`,
            borderRadius: 4, color: theme.error, cursor: "pointer",
            fontSize: 10, padding: "2px 8px", fontFamily: "inherit",
          }}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >del</button>
      )}
    </div>
  );
}

// --- Editor view ---

function EditorView(props: {
  theme: ThemePalette;
  title: string; setTitle: (v: string) => void;
  content: string; setContent: (v: string) => void;
  tags: string; setTags: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  isPrivate: boolean; setPrivate: (v: boolean) => void;
  saving: boolean;
  isEditing: boolean;
  onSave: () => void;
  onBack: () => void;
}) {
  const { theme } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.max(200, textareaRef.current.scrollHeight) + "px";
    }
  }, [props.content]);

  const inputStyle: React.CSSProperties = {
    background: theme.bg,
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: 6,
    color: theme.text,
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };

  return (
    <div style={{ padding: 20, height: "100%", overflow: "auto", display: "flex", flexDirection: "column" as const }}>
      <button
        onClick={props.onBack}
        style={{
          background: "none", border: "none", color: theme.accent,
          fontSize: 13, cursor: "pointer", padding: "4px 0", marginBottom: 16,
          fontFamily: "inherit", textAlign: "left" as const,
        }}
      >&larr; Back to entries</button>

      <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600, color: theme.text }}>
        {props.isEditing ? "Edit Entry" : "New Entry"}
      </h2>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16, flex: 1 }}>
        {/* Title */}
        <input
          style={{ ...inputStyle, fontSize: 16, fontWeight: 600, padding: "12px 14px" }}
          placeholder="Title (optional)"
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
        />

        {/* Content */}
        <textarea
          ref={textareaRef}
          style={{
            ...inputStyle,
            resize: "vertical" as const,
            lineHeight: 1.7,
            minHeight: 200,
            padding: "14px",
          }}
          placeholder="Write your thoughts..."
          value={props.content}
          onChange={(e) => props.setContent(e.target.value)}
          autoFocus
        />

        {/* Category + Private row */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const }}>
          <label style={{ fontSize: 11, color: theme.textMuted, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Category</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                style={{
                  background: props.category === cat ? theme.buttonBg : "none",
                  border: `1px solid ${props.category === cat ? theme.buttonBg : (CATEGORY_COLORS[cat] ?? theme.inputBorder)}`,
                  borderRadius: 6, cursor: "pointer", fontSize: 11,
                  padding: "4px 12px", fontFamily: "inherit", fontWeight: 500,
                  color: props.category === cat ? theme.buttonText : (CATEGORY_COLORS[cat] ?? theme.textMuted),
                }}
                onClick={() => props.setCategory(cat)}
              >{cat}</button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, color: theme.textMuted, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Private</label>
            <button
              style={{
                width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                background: props.isPrivate ? theme.warning : theme.border,
                position: "relative" as const, transition: "background 0.2s",
              }}
              onClick={() => props.setPrivate(!props.isPrivate)}
            >
              <span style={{
                position: "absolute" as const,
                top: 3, left: props.isPrivate ? 21 : 3,
                width: 16, height: 16, borderRadius: "50%",
                background: props.isPrivate ? "#fff" : theme.textFaint,
                transition: "left 0.2s",
              }} />
            </button>
          </div>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
          <label style={{ fontSize: 11, color: theme.textMuted, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Tags</label>
          <input
            style={inputStyle}
            placeholder="comma-separated: gratitude, morning, project"
            value={props.tags}
            onChange={(e) => props.setTags(e.target.value)}
          />
        </div>

        {/* Save button */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            style={{
              background: theme.buttonBg, border: "none", borderRadius: 6,
              color: theme.buttonText, cursor: props.saving ? "not-allowed" : "pointer",
              fontSize: 13, padding: "10px 24px", fontFamily: "inherit",
              fontWeight: 600, opacity: props.saving ? 0.6 : 1,
            }}
            onClick={props.onSave}
            disabled={props.saving}
          >{props.saving ? "Saving..." : props.isEditing ? "Save" : "Create Entry"}</button>
          <button
            style={{
              background: "none", border: `1px solid ${theme.inputBorder}`,
              borderRadius: 6, color: theme.textMuted, cursor: "pointer",
              fontSize: 13, padding: "10px 20px", fontFamily: "inherit",
            }}
            onClick={props.onBack}
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}

// R404: Self-register as sidebar skill at module scope
registerSkill({
  id: "journal",
  name: "Journal",
  icon: "J",
  surface: "sidebar",
  component: JournalView as React.ComponentType<ViewProps>,
  order: 25,
  core: false,
});
