import asyncio

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class RequestBodyLimit:
    """Bound HTTP bodies before JSON parsing, including chunked requests."""

    def __init__(self, app: ASGIApp, max_bytes: int, timeout: float = 10):
        self.app = app
        self.max_bytes = max_bytes
        self.timeout = timeout

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        body = bytearray()

        async def read_body():
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return 0
                body.extend(message.get("body", b""))
                if len(body) > self.max_bytes:
                    return 413
                if not message.get("more_body", False):
                    return 200

        # Content-Length is only an early rejection; actual received bytes are checked too.
        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    length = int(value)
                except ValueError:
                    length = -1
                if length < 0 or length > self.max_bytes:
                    response = JSONResponse(
                        {"detail": "Neplatná velikost požadavku."},
                        status_code=413 if length > self.max_bytes else 400,
                    )
                    await response(scope, receive, send)
                    return
        try:
            status = await asyncio.wait_for(read_body(), self.timeout)
        except TimeoutError:
            status = 408
        if status == 0:
            return
        if status != 200:
            await JSONResponse({"detail": "Požadavek překročil limit."}, status_code=status)(
                scope, receive, send
            )
            return
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, bounded_receive, send)
