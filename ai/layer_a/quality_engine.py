from ai.schemas.base import ImageQualityResult

class ImageQualityEngine:
    def __init__(self):
        # Initialize OpenCV or onnx models here in the future
        pass

    def evaluate_image(self, image_path: str) -> ImageQualityResult:
        """
        Evaluate image quality based on blur, brightness, and occlusion.
        Runs locally without calling LLM providers.
        """
        raise NotImplementedError("Image quality logic goes here")
