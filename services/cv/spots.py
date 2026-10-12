"""Pure-python helpers that turn vehicle detections into parking-space counts.

Kept free of torch/ultralytics so they can be unit-tested anywhere.
All boxes are normalized: x, y = top-left corner, w, h = size, each in 0..1.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable


@dataclass
class Box:
    x: float
    y: float
    w: float
    h: float
    label: str  # "occupied" | "free"
    confidence: float

    def as_dict(self) -> dict:
        return {k: round(v, 4) if isinstance(v, float) else v for k, v in asdict(self).items()}


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax2, ay2 = a[0] + a[2], a[1] + a[3]
    bx2, by2 = b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def overlap_of_bay(bay: tuple[float, float, float, float], car: tuple[float, float, float, float]) -> float:
    """Share of the bay covered by the vehicle box (robust to cars bigger than bays)."""
    iw = max(0.0, min(bay[0] + bay[2], car[0] + car[2]) - max(bay[0], car[0]))
    ih = max(0.0, min(bay[1] + bay[3], car[1] + car[3]) - max(bay[1], car[1]))
    area = bay[2] * bay[3]
    return (iw * ih) / area if area > 0 else 0.0


def dedupe(vehicles: list[Box], threshold: float = 0.6) -> list[Box]:
    """Non-maximum suppression across classes (a car may also be detected as a truck)."""
    kept: list[Box] = []
    for v in sorted(vehicles, key=lambda b: b.confidence, reverse=True):
        if all(iou((v.x, v.y, v.w, v.h), (k.x, k.y, k.w, k.h)) < threshold for k in kept):
            kept.append(v)
    return kept


def count_spaces(
    vehicles: Iterable[Box],
    layout: list[tuple[float, float, float, float]] | None = None,
    expected_spaces: int | None = None,
    occupied_threshold: float = 0.35,
) -> dict:
    """Return boxes and free/occupied counts.

    - With a bay layout: each bay is occupied if a vehicle covers >= threshold of it,
      so we can draw both free and occupied bays.
    - Without a layout: every detected vehicle is an occupied space; free spaces are
      expected_spaces - occupied (we never invent free boxes we didn't see).
    """
    cars = dedupe(list(vehicles))
    if layout:
        boxes: list[Box] = []
        for bay in layout:
            best = max((overlap_of_bay(bay, (c.x, c.y, c.w, c.h)), c.confidence) for c in cars) if cars else (0.0, 0.0)
            occupied = best[0] >= occupied_threshold
            boxes.append(Box(*bay, label="occupied" if occupied else "free", confidence=best[1] if occupied else 1 - best[0]))
        occ = sum(1 for b in boxes if b.label == "occupied")
        return {"boxes": [b.as_dict() for b in boxes], "occupied_count": occ, "free_count": len(boxes) - occ}

    occ = len(cars)
    free = max(0, expected_spaces - occ) if expected_spaces else 0
    return {"boxes": [c.as_dict() for c in cars], "occupied_count": occ, "free_count": free}
