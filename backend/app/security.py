"""Named workspace credentials; local mode remains available for loopback demos."""
import hmac
import json
import os


def credentials():
    raw = os.getenv("WORKSPACE_ACCESS_TOKENS", "{}")
    try:
        entries = json.loads(raw)
        if not isinstance(entries, dict):
            raise ValueError()
        for token, identity in entries.items():
            if (len(token) < 32 or not isinstance(identity, dict)
                    or not isinstance(identity.get("actor"), str)
                    or not 1 <= len(identity["actor"].strip()) <= 100
                    or identity.get("role") not in {"viewer", "analyst", "admin"}):
                raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("WORKSPACE_ACCESS_TOKENS must map 32+ character tokens to named actors and viewer/analyst/admin roles.") from None
    if os.getenv("APP_ENV", "local") == "production" and not entries:
        raise ValueError("Production requires WORKSPACE_ACCESS_TOKENS.")
    return entries


def identify(authorization, entries):
    if not entries:
        return {"actor": "local-workspace", "role": "admin"}
    scheme, _, supplied = (authorization or "").partition(" ")
    if scheme.lower() == "bearer":
        for token, identity in entries.items():
            if hmac.compare_digest(supplied.encode(), token.encode()):
                return identity
    return None
