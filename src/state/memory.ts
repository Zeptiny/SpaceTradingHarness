import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

export type NoteKind = "fact" | "observation" | "strategy" | "todo";

export interface Note {
  id: string;
  kind: NoteKind;
  content: string;
  tags: string[];
  importance: number; // 1..5
  createdAt: number;
  archived: boolean;
}

export interface Goal {
  id: string;
  description: string;
  deadline?: string | undefined; // ISO date
  status: "active" | "completed" | "abandoned";
  createdAt: number;
  completedAt?: number | undefined;
}

const OBSERVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

class Memory {
  notes: Note[] = [];
  goals: Goal[] = [];
  private file = dataFile("memory.json");

  constructor() {
    const parsed = loadJson<{ notes?: Note[]; goals?: Goal[] }>(this.file, {});
    this.notes = parsed.notes ?? [];
    this.goals = parsed.goals ?? [];
  }

  private persist(): void {
    saveJsonAtomic(this.file, { notes: this.notes, goals: this.goals });
  }

  remember(content: string, kind: NoteKind, tags: string[], importance: number): Note {
    const note: Note = {
      id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      kind,
      content,
      tags,
      importance: Math.min(5, Math.max(1, importance)),
      createdAt: Date.now(),
      archived: false,
    };
    this.notes.push(note);
    if (this.notes.filter(n => !n.archived).length > 500) {
      const active = this.notes.filter(n => !n.archived);
      const oldest = active.sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) oldest.archived = true;
    }
    this.persist();
    return note;
  }

  recall(query?: string, tags?: string[], limit = 10): Note[] {
    const q = query?.toLowerCase();
    const recency = (n: Note) => Math.max(0, 3 - (Date.now() - n.createdAt) / (24 * 60 * 60 * 1000));
    return this.notes
      .filter(n => !n.archived)
      .map(n => {
        const textMatch = !!q && n.content.toLowerCase().includes(q);
        const tagMatch = !!tags?.length && tags.some(t => n.tags.includes(t));
        const score = n.importance + (textMatch ? 5 : 0) + (tagMatch ? 3 : 0) + recency(n);
        return { n, score, matched: textMatch || tagMatch };
      })
      .filter(({ matched }) => (q || tags?.length ? matched : true))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ n }) => n);
  }

  forget(idOrTag: string): number {
    let archived = 0;
    this.notes = this.notes.map(n => {
      if (!n.archived && (n.id === idOrTag || n.tags.includes(idOrTag))) {
        archived++;
        return { ...n, archived: true };
      }
      return n;
    });
    if (archived) this.persist();
    return archived;
  }

  setGoal(description: string, deadline?: string): Goal {
    const goal: Goal = {
      id: `g${Date.now().toString(36)}`,
      description,
      deadline,
      status: "active",
      createdAt: Date.now(),
    };
    this.goals.push(goal);
    this.persist();
    return goal;
  }

  completeGoal(id: string, status: "completed" | "abandoned" = "completed"): Goal | undefined {
    const goal = this.goals.find(g => g.id === id);
    if (!goal) return undefined;
    goal.status = status;
    goal.completedAt = Date.now();
    this.persist();
    return goal;
  }

  activeGoals(): Goal[] {
    return this.goals.filter(g => g.status === "active");
  }

  consolidate(): number {
    const cutoff = Date.now() - OBSERVATION_TTL_MS;
    let archived = 0;
    this.notes = this.notes.map(n => {
      if (n.kind === "observation" && !n.archived && n.createdAt < cutoff && n.importance < 4) {
        archived++;
        return { ...n, archived: true };
      }
      return n;
    });
    if (archived) this.persist();
    return archived;
  }
}

export const memory = new Memory();
