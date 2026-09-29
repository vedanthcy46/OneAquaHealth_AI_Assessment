from abc import ABC, abstractmethod

class BaseAIProvider(ABC):
    @abstractmethod
    async def analyze_image(self, image_path: str, prompt: str) -> str:
        """Analyze an image using a vision model."""
        pass

    @abstractmethod
    async def generate_text(self, prompt: str) -> str:
        """Generate text from a prompt."""
        pass
