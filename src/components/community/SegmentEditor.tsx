"use client";

import { Plus, Trash2, X } from "lucide-react";
import { SEGMENT_LIMITS } from "@/lib/constants";
import type { SegmentDef } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const L = SEGMENT_LIMITS;

/** A stable, short id for a question (answers are keyed by it, so it must not change). */
function newQuestionId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Build a fresh blank question (starts with the minimum number of empty options). */
function blankQuestion(): SegmentDef {
  return { id: newQuestionId(), label: "", options: Array.from({ length: L.optionsMin }, () => "") };
}

/**
 * Controlled editor for a community's member questions (segment dimensions). Owners define up to
 * `questionsMax` questions, each a label + 2–`optionsMax` options. Emits the full `SegmentDef[]`;
 * the caller sanitizes/validates before sending (a blank/untouched question is dropped there).
 */
export function SegmentEditor({
  value,
  onChange,
}: {
  value: SegmentDef[];
  onChange: (next: SegmentDef[]) => void;
}) {
  function updateQuestion(idx: number, patch: Partial<SegmentDef>) {
    onChange(value.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    if (value.length >= L.questionsMax) return;
    onChange([...value, blankQuestion()]);
  }

  function removeQuestion(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function setOption(qi: number, oi: number, val: string) {
    updateQuestion(qi, { options: value[qi].options.map((o, i) => (i === oi ? val : o)) });
  }

  function addOption(qi: number) {
    if (value[qi].options.length >= L.optionsMax) return;
    updateQuestion(qi, { options: [...value[qi].options, ""] });
  }

  function removeOption(qi: number, oi: number) {
    if (value[qi].options.length <= L.optionsMin) return;
    updateQuestion(qi, { options: value[qi].options.filter((_, i) => i !== oi) });
  }

  return (
    <div className="space-y-4">
      {value.map((q, qi) => (
        <div key={q.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`seg-${q.id}`}>Question {qi + 1}</Label>
              <Input
                id={`seg-${q.id}`}
                placeholder="e.g. Which class year are you?"
                maxLength={L.labelMax}
                value={q.label}
                onChange={(e) => updateQuestion(qi, { label: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeQuestion(qi)}
              aria-label={`Remove question ${qi + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Options</Label>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <Input
                  placeholder={`Option ${oi + 1}`}
                  maxLength={L.optionMax}
                  value={opt}
                  onChange={(e) => setOption(qi, oi, e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={q.options.length <= L.optionsMin}
                  onClick={() => removeOption(qi, oi)}
                  aria-label={`Remove option ${oi + 1}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {q.options.length < L.optionsMax && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => addOption(qi)}
              >
                <Plus className="h-4 w-4" /> Add option
              </Button>
            )}
          </div>
        </div>
      ))}

      {value.length < L.questionsMax && (
        <Button type="button" variant="outline" className="gap-1.5" onClick={addQuestion}>
          <Plus className="h-4 w-4" /> Add a question
        </Button>
      )}
    </div>
  );
}
