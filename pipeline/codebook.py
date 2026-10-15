"""
Codebook loader
===============

Reads ``codebook/codebook.yaml`` and turns it into a flat list of export
columns. Every other part of the project (synthetic generator, cleaning,
derived variables, reports, portal export) asks this module which columns
exist, what their codes mean and when a question is shown.

Key ideas, step by step
-----------------------
1. A YAML entry can describe ONE column (e.g. ``pgm_nps``) or a FAMILY of
   columns:
     * ``expand: skills``  -> one column per skill, ``*`` replaced by the key
       (``pgm_skill_imp_*`` -> ``pgm_skill_imp_leadership`` ...).
     * ``type: multi``     -> one 0/1 column per answer option
       (``ce_type`` -> ``ce_type_1`` ... ``ce_type_7``), plus a ``_TEXT``
       column for "Other (please specify)" options.
2. Each expanded column becomes a :class:`Column` object that carries its
   label, value labels and display condition.
3. ``Codebook.columns`` keeps the export order, so writing a CSV in codebook
   order reproduces the Qualtrics layout.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

#: Default location of the codebook, relative to the project root.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CODEBOOK = PROJECT_ROOT / "codebook" / "codebook.yaml"

#: Option labels that mean "Other (please specify)" and therefore come with a
#: free-text column in the Qualtrics export.
OTHER_LABELS = {"other"}


@dataclass
class Column:
    """One column of the survey export."""

    name: str                       # column name in the export
    question: str                   # name of the question it belongs to
    block: str                      # Qualtrics block
    type: str                       # single | multi_option | numeric | text | country | meta
    label: str                      # human-readable label
    values: dict = field(default_factory=dict)   # code -> label (single)
    display_if: str = ""            # pandas query expression ("" = always)
    option_code: Optional[int] = None            # for multi options: the code
    exclusive: bool = False         # multi option that excludes all others
    max_select: Optional[int] = None             # for multi options: limit of the question
    value_range: Optional[tuple] = None          # for numeric columns
    optional: bool = False          # respondent may leave it blank


class Codebook:
    """Parsed codebook with convenient look-ups.

    Example
    -------
    >>> cb = Codebook.load()
    >>> cb["pgm_nps"].values[10]
    '10'
    >>> cb.multi_columns("ce_type")[:2]
    ['ce_type_1', 'ce_type_2']
    """

    def __init__(self, raw: dict):
        self.raw = raw
        self.value_sets: dict = raw.get("value_sets", {})
        self.skills: dict = raw.get("skills", {})
        self.columns: list[Column] = []
        # question name -> list of column names that belong to it
        self.questions: dict[str, list[str]] = {}
        # question name -> raw YAML spec (needed for option-level logic)
        self.question_specs: dict[str, dict] = {}
        for spec in raw["variables"]:
            self._add(spec)
        self._by_name = {c.name: c for c in self.columns}

    # ------------------------------------------------------------------ load
    @classmethod
    def load(cls, path: Path | str = DEFAULT_CODEBOOK) -> "Codebook":
        """Read the YAML file and build the codebook."""
        with open(path, encoding="utf-8") as fh:
            return cls(yaml.safe_load(fh))

    # --------------------------------------------------------------- helpers
    def __getitem__(self, name: str) -> Column:
        return self._by_name[name]

    def __contains__(self, name: str) -> bool:
        return name in self._by_name

    @property
    def names(self) -> list[str]:
        """All export column names in export order."""
        return [c.name for c in self.columns]

    def multi_columns(self, question: str) -> list[str]:
        """The 0/1 option columns of a multi-select question (no _TEXT)."""
        return [n for n in self.questions[question]
                if self._by_name[n].type == "multi_option"]

    def option_code_columns(self, question: str) -> dict[int, str]:
        """Map option code -> column name for a multi-select question."""
        return {self._by_name[n].option_code: n for n in self.multi_columns(question)}

    def value_label(self, column: str, code) -> str:
        """Translate a numeric code into its label ('' if unknown/missing)."""
        try:
            return self._by_name[column].values.get(int(code), "")
        except (TypeError, ValueError):
            return ""

    # ------------------------------------------------------------- internals
    def _values_of(self, spec: dict) -> dict:
        """Resolve inline ``values`` or a reusable ``value_set``."""
        if "values" in spec:
            vals = spec["values"]
        elif "value_set" in spec:
            vals = self.value_sets[spec["value_set"]]
        else:
            vals = {}
        return {int(k): str(v) for k, v in vals.items()}

    def _register(self, question: str, col: Column) -> None:
        self.columns.append(col)
        self.questions.setdefault(question, []).append(col.name)

    def _add(self, spec: dict) -> None:
        name, typ = spec["name"], spec["type"]
        values = self._values_of(spec)
        rng = tuple(spec["range"]) if "range" in spec else None

        # Step 1: families of matrix rows, e.g. pgm_skill_imp_* over all skills
        if spec.get("expand") == "skills":
            question = name.rstrip("_*")
            self.question_specs[question] = spec
            for key, skill_label in self.skills.items():
                self._register(question, Column(
                    name=name.replace("*", key),
                    question=question,
                    block=spec["block"],
                    type=typ,
                    label=spec["label"].format(skill=skill_label),
                    values=values,
                    display_if=spec.get("display_if", "").format(key=key),
                ))
            return

        self.question_specs[name] = spec

        # Step 2: multi-select -> one 0/1 column per option (+ _TEXT for "Other")
        if typ == "multi":
            exclusive = set(spec.get("exclusive", []))
            for code, opt_label in values.items():
                cond = spec.get("display_if", "")
                opt_cond = spec.get("option_display_if", {}).get(code)
                if opt_cond:
                    cond = f"({cond}) and ({opt_cond})" if cond else opt_cond
                self._register(name, Column(
                    name=f"{name}_{code}",
                    question=name,
                    block=spec["block"],
                    type="multi_option",
                    label=f"{spec['label']}: {opt_label}",
                    values={1: opt_label},
                    display_if=cond,
                    option_code=code,
                    exclusive=code in exclusive,
                    max_select=spec.get("max_select"),
                ))
                if opt_label.strip().lower() in OTHER_LABELS:
                    self._register(name, Column(
                        name=f"{name}_{code}_TEXT",
                        question=name,
                        block=spec["block"],
                        type="text",
                        label=f"{spec['label']}: other (text)",
                        display_if=f"{name}_{code} == 1",
                    ))
            return

        # Step 3: everything else is a single column
        self._register(name, Column(
            name=name,
            question=name,
            block=spec["block"],
            type=typ,
            label=spec["label"],
            values=values,
            display_if=spec.get("display_if", ""),
            value_range=rng,
            optional=bool(spec.get("optional", False)),
        ))
