"""Bounded retries, explicit timeouts, freshness and secret-safe context handling."""
import concurrent.futures
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Optional


_SECRET_KEY = re.compile(r"(secret|token|password|passwd|authorization|credential|api[_-]?key|tenant[_-]?route)", re.I)
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")
_ASSIGNMENT = re.compile(r"(?i)\b(password|token|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+")


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3
    base_delay_seconds: float = 0.25
    max_delay_seconds: float = 4.0
    jitter_ratio: float = 0.2

    def __post_init__(self) -> None:
        if not 1 <= self.max_attempts <= 5:
            raise ValueError("max_attempts must be between 1 and 5")
        if self.base_delay_seconds < 0 or self.max_delay_seconds < 0:
            raise ValueError("retry delays must be non-negative")
        if not 0 <= self.jitter_ratio <= 1:
            raise ValueError("jitter_ratio must be between 0 and 1")


def mask_sensitive_context(value: Any) -> Any:
    """Recursively redact sensitive mapping values and common secret strings."""
    if isinstance(value, Mapping):
        return {str(k): ("[REDACTED]" if _SECRET_KEY.search(str(k)) else mask_sensitive_context(v))
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [mask_sensitive_context(v) for v in value]
    if isinstance(value, str):
        return _ASSIGNMENT.sub(lambda m: m.group(1) + "=[REDACTED]",
                               _BEARER.sub("Bearer [REDACTED]", value))
    return value


def evaluate_freshness(observed_at: datetime, *, max_age_seconds: float,
                       now: Optional[datetime] = None) -> str:
    if max_age_seconds < 0:
        raise ValueError("max_age_seconds must be non-negative")
    current = now or datetime.now(timezone.utc)
    if observed_at.tzinfo is None or current.tzinfo is None:
        raise ValueError("timestamps must be timezone-aware")
    age = (current - observed_at).total_seconds()
    if age < 0:
        return "incomplete"
    return "fresh" if age <= max_age_seconds else "stale"


def run_with_retry(fn: Callable[[], Any], *, timeout_seconds: float,
                   policy: RetryPolicy = RetryPolicy(),
                   sleep: Callable[[float], None] = time.sleep,
                   random_uniform: Callable[[float, float], float] = random.uniform) -> Any:
    """Retry ordinary failures with bounded exponential backoff and jitter.

    Python cannot safely terminate an arbitrary running thread. Therefore a timeout
    cancels only work that has not started and is NOT retried: retrying could overlap
    an uncancellable side effect. For hard termination, run the job in an isolated
    process/container with an explicit kill policy.
    """
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be positive")
    last_error: Optional[BaseException] = None
    for attempt in range(policy.max_attempts):
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(fn)
        try:
            result = future.result(timeout=timeout_seconds)
        except concurrent.futures.TimeoutError:
            future.cancel()
            executor.shutdown(wait=False, cancel_futures=True)
            raise TimeoutError("job timed out; automatic retry suppressed to prevent overlap") from None
        except Exception as exc:
            last_error = exc
            executor.shutdown(wait=True, cancel_futures=True)
            if attempt + 1 >= policy.max_attempts:
                break
            ceiling = min(policy.max_delay_seconds,
                          policy.base_delay_seconds * (2 ** attempt))
            delay = ceiling + random_uniform(0.0, ceiling * policy.jitter_ratio)
            sleep(delay)
        else:
            executor.shutdown(wait=True)
            return result
    raise RuntimeError("job failed after bounded retries; details suppressed") from None
