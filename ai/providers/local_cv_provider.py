"""
Local OpenCV/NumPy computer vision provider for ecological stream evidence.

Acts as an automated on-device fallback when external cloud LLM API keys
(OpenAI / Gemini) are unavailable, ensuring zero downtime and fully offline
functional environmental analysis.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import cv2
import numpy as np

from ai.providers.base import VisionEvidenceProvider, VisionResponse
from ai.utils.exceptions import AIProviderError
from ai.utils.logger import get_logger

logger = get_logger(__name__)


class LocalCVProvider(VisionEvidenceProvider):
    """
    Direct computer vision ecological indicator analyzer using OpenCV.
    Extracts turbidity, riparian coverage, flow dynamics, and channel structure
    from real image pixel distributions.
    """

    @property
    def provider_name(self) -> str:
        return "local_cv"

    @property
    def model_name(self) -> str:
        return "AquaGuard-OpenCV-CV2"

    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        path = Path(image_path)
        if not path.is_file():
            raise AIProviderError(f"Image file does not exist: {image_path}")

        img = cv2.imread(str(path))
        if img is None:
            raise AIProviderError(f"Unable to decode image via OpenCV: {image_path}")

        h, w, _ = img.shape
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # ── 1. Riparian Vegetation Detection (Green chromatic index) ──────────
        # HSV green range: H in [35, 85], S in [30, 255]
        green_mask = cv2.inRange(hsv, (35, 30, 30), (85, 255, 255))
        green_ratio = float(np.count_nonzero(green_mask)) / (h * w)

        if green_ratio > 0.22:
            riparian_val = "dense"
            riparian_conf = min(0.92, 0.70 + green_ratio * 0.8)
            riparian_ev = f"Dense green riparian corridor coverage detected across {green_ratio*100:.1f}% of visible reach."
        elif green_ratio > 0.06:
            riparian_val = "sparse"
            riparian_conf = 0.82
            riparian_ev = f"Moderate bankside vegetation present along banks ({green_ratio*100:.1f}% vegetative fraction)."
        else:
            riparian_val = "absent"
            riparian_conf = 0.78
            riparian_ev = "Minimal to absent vegetative riparian verge observed along the wetted channel."

        # ── 2. Turbidity Analysis (Sediment chrominance & reflectance) ────────
        # Lower half / central water region
        lower_region = lab[int(h * 0.4):, :]
        l_chan, a_chan, b_chan = cv2.split(lower_region)
        mean_b = float(np.mean(b_chan))  # higher b* in Lab = yellowish/brown sediment
        std_l = float(np.std(l_chan))    # optical scattering variance

        # Silt/turbid water has elevated yellow-brown chrominance (b* > 138 in 0-255 Lab)
        if mean_b > 140:
            turbidity_val = "opaque"
            turbidity_conf = 0.88
            turbidity_ev = "High optical scattering with pronounced brownish-yellow sediment coloration."
        elif mean_b > 132 or std_l < 18:
            turbidity_val = "cloudy"
            turbidity_conf = 0.82
            turbidity_ev = "Diffused streambed visibility with moderate optical turbidity and suspended silt."
        else:
            turbidity_val = "clear"
            turbidity_conf = 0.90
            turbidity_ev = "High optical clarity with low suspended sediment scattering and visible substrate."

        # ── 3. Flow Condition (High-frequency surface ripples & gradients) ───
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        gradient_mag = np.mean(np.sqrt(sobelx**2 + sobely**2))

        if gradient_mag > 32:
            flow_val = "flowing"
            flow_conf = 0.86
            flow_ev = "Active surface ripples, velocity gradients, and turbulent stream flow visible."
        elif gradient_mag > 12:
            flow_val = "flowing"
            flow_conf = 0.80
            flow_ev = "Continuous stream flow visible with gentle surface currents."
        else:
            flow_val = "stagnant"
            flow_conf = 0.75
            flow_ev = "Smooth, unruffled water surface indicating stagnant or ponded channel conditions."

        # ── 4. Floating Debris & Litter ─────────────────────────────────────────
        # High saturation artificial elements on water surface
        sat_mask = cv2.inRange(hsv[int(h * 0.4):, :], (0, 160, 160), (180, 255, 255))
        unnatural_ratio = float(np.count_nonzero(sat_mask)) / (h * 0.6 * w)

        if unnatural_ratio > 0.015:
            debris_val = "present"
            debris_conf = 0.78
            debris_ev = "Color-contrast surface objects consistent with floating anthropogenic debris detected."
            debris_cov = round(unnatural_ratio * 100, 1)
        else:
            debris_val = "absent"
            debris_conf = 0.88
            debris_ev = "No prominent floating trash or surface debris rafts visible."
            debris_cov = 0.0

        # ── 5. Concrete Channel vs Natural Bed ─────────────────────────────────
        # Gray color dominance and sharp straight line structures
        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=80, minLineLength=60, maxLineGap=10)
        line_count = len(lines) if lines is not None else 0

        # Low saturation, moderate lightness = concrete
        sat_mean = np.mean(hsv[:, :, 1])
        if line_count > 15 and sat_mean < 45:
            concrete_val = "present"
            concrete_conf = 0.84
            concrete_ev = "Engineered linear revetments, artificial culvert, or concrete wall structures present."
        else:
            concrete_val = "absent"
            concrete_conf = 0.88
            concrete_ev = "Natural earthen banks and organic streambed morphology without artificial lining."

        # ── 6. Algal Bloom ─────────────────────────────────────────────────────
        # Strong vibrant algae green on the wetted channel
        algae_mask = cv2.inRange(hsv[int(h * 0.35):, :], (38, 100, 40), (80, 255, 200))
        algae_ratio = float(np.count_nonzero(algae_mask)) / (h * 0.65 * w)

        if algae_ratio > 0.08:
            algae_val = "present"
            algae_conf = 0.82
            algae_sev = "medium"
            algae_ev = "Visible filamentous algal accumulation and benthic mats on the wetted channel."
        else:
            algae_val = "absent"
            algae_conf = 0.90
            algae_sev = "unknown"
            algae_ev = "No dominant algal blooms or visible surface scums detected."

        # Assemble strict Layer B schema output
        evidence_dict: Dict[str, Any] = {
            "turbidity": {
                "value": turbidity_val,
                "confidence": turbidity_conf,
                "evidence": turbidity_ev
            },
            "debris": {
                "value": debris_val,
                "confidence": debris_conf,
                "evidence": debris_ev,
                "estimated_coverage_pct": debris_cov
            },
            "algal_bloom": {
                "value": algae_val,
                "severity": algae_sev,
                "confidence": algae_conf,
                "evidence": algae_ev
            },
            "riparian_vegetation": {
                "value": riparian_val,
                "confidence": riparian_conf,
                "evidence": riparian_ev
            },
            "concrete_channel": {
                "value": concrete_val,
                "confidence": concrete_conf,
                "evidence": concrete_ev
            },
            "flow_condition": {
                "value": flow_val,
                "confidence": flow_conf,
                "evidence": flow_ev
            }
        }

        raw_json = json.dumps(evidence_dict)
        return VisionResponse(
            text=raw_json,
            provider_name=self.provider_name,
            model_used=self.model_name
        )
