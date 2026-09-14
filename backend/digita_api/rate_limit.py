from threading import Lock
from time import monotonic


class AuthRateLimit:
    """Bounded, per-process fixed windows for registration and login together."""

    def __init__(self, limit: int):
        self.limit = limit
        self.windows: dict[str, tuple[float, int]] = {}
        self.lock = Lock()

    def allow(self, address: str) -> bool:
        current = monotonic()
        with self.lock:
            self.windows = {key: value for key, value in self.windows.items() if value[0] > current}
            expiry, count = self.windows.get(address, (current + 60, 0))
            if count >= self.limit or (address not in self.windows and len(self.windows) >= 4096):
                return False
            self.windows[address] = expiry, count + 1
            return True
