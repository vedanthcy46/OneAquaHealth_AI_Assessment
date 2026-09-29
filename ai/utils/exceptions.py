class AIProviderError(Exception):
    """Raised when an AI provider fails to return a valid response."""
    pass

class SafetyPolicyViolation(Exception):
    """Raised when an output violates the AI safety policy."""
    pass

class ImageQualityTooLow(Exception):
    """Raised when an image fails Layer A hard checks."""
    pass
