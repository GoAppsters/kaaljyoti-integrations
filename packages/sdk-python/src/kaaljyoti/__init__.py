"""Typed Python client for the Kaal Jyoti API.

```python
import os
from kaaljyoti import Birth, Kaaljyoti, KundliRequest

kj = Kaaljyoti(api_key=os.environ["KAALJYOTI_API_KEY"])
answer = kj.kundli.get(
    KundliRequest(
        birth=Birth(
            datetime="1990-05-14T10:30:00",
            timezone="Asia/Kolkata",
            latitude=28.6139,
            longitude=77.209,
        )
    )
)
print(answer.data.lagna_sign.name, answer.meta.timezone.source)
```

Everything public is importable from here: the client, `Result`, `PdfFile`,
`KaaljyotiError`, the HTTP seam, the wall-clock helpers, and every generated
request and document class (see `kaaljyoti.generated`).
"""

from kaaljyoti.client import Kaaljyoti
from kaaljyoti.errors import KaaljyotiError
from kaaljyoti.generated import *  # noqa: F403
from kaaljyoti.generated import __all__ as _generated_all
from kaaljyoti.http import (
    HttpClient,
    HttpRequest,
    HttpResponse,
    HttpxClient,
    TransportError,
    UrllibClient,
)
from kaaljyoti.result import PdfFile, RateLimit, Result
from kaaljyoti.transport import Transport
from kaaljyoti.wallclock import format_wall_clock, from_wall_clock, to_wall_clock, utc_offset_at

__version__ = SDK_VERSION  # noqa: F405

__all__ = [
    "__version__",
    "HttpClient",
    "HttpRequest",
    "HttpResponse",
    "HttpxClient",
    "Kaaljyoti",
    "KaaljyotiError",
    "PdfFile",
    "RateLimit",
    "Result",
    "Transport",
    "TransportError",
    "UrllibClient",
    "format_wall_clock",
    "from_wall_clock",
    "to_wall_clock",
    "utc_offset_at",
    *_generated_all,
]
