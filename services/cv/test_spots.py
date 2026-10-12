"""Run: python -m pytest services/cv  (or: python services/cv/test_spots.py)"""

from spots import Box, count_spaces, dedupe, iou


def test_iou_identical_and_disjoint():
    assert iou((0, 0, 0.5, 0.5), (0, 0, 0.5, 0.5)) == 1
    assert iou((0, 0, 0.1, 0.1), (0.5, 0.5, 0.1, 0.1)) == 0


def test_dedupe_keeps_highest_confidence():
    a = Box(0.1, 0.1, 0.2, 0.2, "occupied", 0.9)
    b = Box(0.11, 0.1, 0.2, 0.2, "occupied", 0.6)  # same car, detected as truck
    assert dedupe([b, a]) == [a]


def test_without_layout_counts_free_from_expected():
    cars = [Box(0.1, 0.1, 0.1, 0.1, "occupied", 0.8), Box(0.5, 0.5, 0.1, 0.1, "occupied", 0.7)]
    out = count_spaces(cars, expected_spaces=5)
    assert out["occupied_count"] == 2 and out["free_count"] == 3
    assert all(b["label"] == "occupied" for b in out["boxes"])


def test_without_layout_never_negative():
    cars = [Box(i / 10, 0, 0.05, 0.05, "occupied", 0.9) for i in range(4)]
    assert count_spaces(cars, expected_spaces=2)["free_count"] == 0


def test_with_layout_marks_bays():
    layout = [(0.0, 0.0, 0.2, 0.3), (0.25, 0.0, 0.2, 0.3), (0.5, 0.0, 0.2, 0.3)]
    cars = [Box(0.02, 0.02, 0.17, 0.26, "occupied", 0.9)]
    out = count_spaces(cars, layout=layout)
    assert out["occupied_count"] == 1 and out["free_count"] == 2
    assert [b["label"] for b in out["boxes"]] == ["occupied", "free", "free"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
