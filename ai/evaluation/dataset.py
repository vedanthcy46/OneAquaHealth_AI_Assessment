"""
Evaluation dataset loading for Layer B (spec Day-5).

Dataset layout (expected under a dataset directory, e.g. `ai/evaluation/data/`):

    data/
      images/            # the labelled stream photographs (.jpg/.png)
        img001.jpg
        img002.jpg
        ...
      labels.json        # ground-truth labels (see schema below)

labels.json schema:
    {
      "images": [
        {
          "file": "img001.jpg",
          "labels": {
            "turbidity": true,           # present/absent ground truth per indicator
            "debris": false,
            "algal_bloom": true,
            "riparian_vegetation": true,
            "concrete_channel": false,
            "flow_condition": true,
            "natural_channel": true,
            "foam_presence": false,
            "water_color_anomaly": false,
            "low_water_flow": false,
            "high_water_flow": true
          }
        }
      ]
    }

Only the indicators you actually label are scored — you don't have to label all
eleven for every image.

STATUS: The loader is implemented and tested. No real labelled images ship in
this repo yet, so `load_labels` returns an empty set unless a dataset is
provided. Populate `data/` with ~20 labelled real stream photos to produce
validated precision/recall/F1 (spec target).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List


@dataclass
class LabeledImage:
    file: str
    labels: Dict[str, bool]


def load_labels(labels_path: str | Path) -> List[LabeledImage]:
    """
    Load ground-truth labels from a labels.json file.

    Returns an empty list if the file does not exist (no dataset yet), so
    callers/tests can run without shipped imagery.
    """
    path = Path(labels_path)
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    images = data.get("images", [])
    out: List[LabeledImage] = []
    for entry in images:
        out.append(LabeledImage(file=str(entry["file"]), labels=dict(entry["labels"])))
    return out
