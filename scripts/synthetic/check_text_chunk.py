"""
Check the open answers written by a text agent for one chunk.

Usage:  .venv/bin/python scripts/synthetic/check_text_chunk.py europe_1

Step by step it verifies that
  1. every line in .work/text_responses/<chunk>_part*.jsonl is valid JSON with
     the keys ResponseId, field, text,
  2. every requested (ResponseId, field) pair from .work/text_chunks/<chunk>.jsonl
     has exactly one non-empty answer, and nothing extra was written,
  3. answers are not copy-pasted: among answers with more than three words,
     at least 90 % per field are distinct (short answers such as "n/a" or
     "Nothing." may repeat — real people write them all the time),
  4. answers do not start with the same four words again and again
     (at most MAX_SAME_OPENING times per field), so phrases vary.
It prints what is missing so the agent can fix it.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / ".work"
MAX_SAME_OPENING = 3


def opening(text: str, n: int = 4) -> str:
    """First ``n`` words of a text, lower case, without punctuation at the ends."""
    words = [w.strip(".,;:!?\"'()").lower() for w in text.split()]
    return " ".join(w for w in words[:n] if w)


def check(chunk: str, root: Path = ROOT) -> list[str]:
    """Return a list of problems for one chunk (empty list = chunk complete)."""
    requested = set()
    for line in open(root / "text_chunks" / f"{chunk}.jsonl", encoding="utf-8"):
        if line.strip():
            rec = json.loads(line)
            requested |= {(rec["ResponseId"], f) for f in rec["fields"]}

    answers, problems = Counter(), []
    texts_by_field: dict[str, list[str]] = {}
    for part in sorted((root / "text_responses").glob(f"{chunk}_part*.jsonl")):
        for n, line in enumerate(open(part, encoding="utf-8"), 1):
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
                key = (rec["ResponseId"], rec["field"])
                assert isinstance(rec["text"], str) and rec["text"].strip()
            except Exception as exc:  # noqa: BLE001
                problems.append(f"{part.name}:{n} invalid line ({exc})")
                continue
            answers[key] += 1
            texts_by_field.setdefault(rec["field"], []).append(rec["text"].strip())

    missing = sorted(requested - set(answers))
    extra = sorted(set(answers) - requested)
    dupes = [k for k, c in answers.items() if c > 1]
    print(f"requested {len(requested)}, answered {len(set(answers) & requested)}")
    for f, texts in texts_by_field.items():
        # 3. copy-paste check, only for answers longer than three words
        longer = [t.lower() for t in texts if len(t.split()) > 3]
        if len(longer) >= 20 and len(set(longer)) / len(longer) < 0.9:
            problems.append(f"field {f}: only {len(set(longer)) / len(longer):.0%} distinct texts")
        # 4. the same opening phrase over and over
        openings = Counter(opening(t) for t in texts if len(t.split()) > 4)
        for start, count in openings.items():
            if count > MAX_SAME_OPENING:
                problems.append(f"field {f}: {count} answers start with '{start} ...' "
                                f"(max {MAX_SAME_OPENING}) - vary the wording")
    for label, items in (("MISSING", missing), ("EXTRA", extra), ("DUPLICATE", dupes)):
        if items:
            problems.append(f"{label} {len(items)}: {items[:15]}")
    return problems


def main() -> None:
    problems = check(sys.argv[1])
    print("\n".join(problems) if problems else "OK – chunk complete")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
