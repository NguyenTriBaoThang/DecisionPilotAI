"""Named workspace credentials with tenant scoping; local mode remains available for loopback demos."""
import hmac
import json
import os
import re


COMPANY_ID_RX = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")


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
            c_id = identity.get("company_id")
            c_ids = identity.get("company_ids")
            if c_id is not None and (not isinstance(c_id, str) or not COMPANY_ID_RX.match(c_id)):
                raise ValueError()
            if c_ids is not None:
                if c_ids != "*" and not (
                    isinstance(c_ids, list)
                    and len(c_ids) > 0
                    and all(isinstance(x, str) and (x == "*" or COMPANY_ID_RX.match(x)) for x in c_ids)
                ):
                    raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("WORKSPACE_ACCESS_TOKENS must map 32+ character tokens to named actors and viewer/analyst/admin roles.") from None
    if os.getenv("APP_ENV", "local") == "production" and not entries:
        raise ValueError("Production requires WORKSPACE_ACCESS_TOKENS.")
    return entries


def identify(authorization, entries):
    if not entries:
        return {
            "actor": "local-workspace",
            "role": "admin",
            "company_ids": ["*"],
            "default_company_id": "comp-default",
        }
    scheme, _, supplied = (authorization or "").partition(" ")
    if scheme.lower() == "bearer":
        for token, identity in entries.items():
            if hmac.compare_digest(supplied.encode(), token.encode()):
                c_ids = identity.get("company_ids")
                if c_ids == "*":
                    resolved_ids = ["*"]
                elif isinstance(c_ids, list):
                    resolved_ids = list(c_ids)
                elif identity.get("company_id"):
                    resolved_ids = [identity["company_id"]]
                else:
                    resolved_ids = ["comp-default"]
                default_cid = (
                    identity.get("default_company_id")
                    or identity.get("company_id")
                    or (resolved_ids[0] if resolved_ids and resolved_ids[0] != "*" else "comp-default")
                )
                return {
                    **identity,
                    "company_ids": resolved_ids,
                    "default_company_id": default_cid,
                }
    return None


def authorize_company(identity: dict, requested_company_id: str | None) -> str:
    """Resolve and strictly authorize the tenant company_id for the current request."""
    candidate = (requested_company_id or "").strip() or identity.get("default_company_id") or "comp-default"
    if not COMPANY_ID_RX.match(candidate):
        raise ValueError("Invalid company identifier format.")
    allowed = identity.get("company_ids") or ["comp-default"]
    if "*" not in allowed and candidate not in allowed:
        raise PermissionError(f"Access denied for tenant company '{candidate}'.")
    return candidate
