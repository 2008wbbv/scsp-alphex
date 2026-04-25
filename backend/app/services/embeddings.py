from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import get_settings


def _client() -> OpenAI:
    return OpenAI(api_key=get_settings().OPENAI_API_KEY)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns a list of 1536-d vectors."""
    if not texts:
        return []
    settings = get_settings()
    resp = _client().embeddings.create(
        model=settings.EMBED_MODEL,
        input=texts,
    )
    return [d.embedding for d in resp.data]


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
