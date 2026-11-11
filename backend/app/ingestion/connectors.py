"""Extensible data source connector architecture for files, SQL databases, REST APIs, and ERP/CRM/POS platforms."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import re
from typing import Any


SECRET_KEY_PATTERN = re.compile(r"(password|passwd|secret|token|api_key|apikey|credential|private_key)", re.I)


def redact_config(config: dict[str, Any] | None) -> dict[str, Any]:
    """Strip sensitive credential values before persisting connector configuration to metadata storage."""
    if not isinstance(config, dict):
        return {}
    sanitized: dict[str, Any] = {}
    for key, value in config.items():
        if SECRET_KEY_PATTERN.search(str(key)):
            sanitized[str(key)] = "***redacted***" if value else ""
        elif isinstance(value, dict):
            sanitized[str(key)] = redact_config(value)
        else:
            sanitized[str(key)] = value
    return sanitized


@dataclass(frozen=True)
class ConnectorField:
    name: str
    label: str
    field_type: str = "text"
    required: bool = False
    secret: bool = False
    placeholder: str = ""
    options: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ConnectorCapability:
    connector_type: str
    display_name: str
    category: str
    status: str  # "active" | "extensible"
    description: str
    supported_formats: list[str]
    config_fields: list[ConnectorField]

    def to_dict(self) -> dict[str, Any]:
        return {
            "connector_type": self.connector_type,
            "display_name": self.display_name,
            "category": self.category,
            "status": self.status,
            "description": self.description,
            "supported_formats": self.supported_formats,
            "config_fields": [
                {
                    "name": f.name,
                    "label": f.label,
                    "field_type": f.field_type,
                    "required": f.required,
                    "secret": f.secret,
                    "placeholder": f.placeholder,
                    "options": f.options,
                }
                for f in self.config_fields
            ],
        }


class DataSourceConnector(ABC):
    """Base contract every current and future Enterprise connector implements."""

    capability: ConnectorCapability

    @abstractmethod
    def validate_config(self, config: dict[str, Any]) -> list[str]:
        """Return list of human-readable validation issues (empty when valid)."""

    def test_connection(self, config: dict[str, Any]) -> dict[str, Any]:
        errors = self.validate_config(config)
        if errors:
            return {"ok": False, "status": "invalid_config", "errors": errors}
        return {
            "ok": False,
            "status": "adapter_configured",
            "message": f"{self.capability.display_name} connector adapter registered. Provide live runtime credentials/driver in deployment worker to sync.",
        }


class FileUploadConnector(DataSourceConnector):
    capability = ConnectorCapability(
        connector_type="file_upload",
        display_name="Multimodal File Upload",
        category="file",
        status="active",
        description="Direct validated ingestion across Structured (CSV, XLSX, XLS, JSON, XML), Documents (PDF, DOCX, PPTX, TXT), Images (JPG, PNG, WEBP), Video (MP4, MOV, AVI), and Audio (MP3, WAV, M4A).",
        supported_formats=[
            "csv", "xlsx", "xls", "json", "xml",
            "pdf", "docx", "pptx", "txt",
            "jpg", "jpeg", "png", "webp",
            "mp4", "mov", "avi",
            "mp3", "wav", "m4a",
        ],
        config_fields=[],
    )

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        return []

    def test_connection(self, config: dict[str, Any]) -> dict[str, Any]:
        return {"ok": True, "status": "ready", "message": "File upload pipeline active."}


class PostgresConnector(DataSourceConnector):
    capability = ConnectorCapability(
        connector_type="postgresql",
        display_name="PostgreSQL",
        category="database",
        status="extensible",
        description="Read-only SSL connection adapter for PostgreSQL analytics warehouses and transactional replicas.",
        supported_formats=["sql_table", "sql_view"],
        config_fields=[
            ConnectorField("host", "Host", required=True, placeholder="db.company.internal"),
            ConnectorField("port", "Port", field_type="number", required=True, placeholder="5432"),
            ConnectorField("database", "Database", required=True, placeholder="sales_warehouse"),
            ConnectorField("schema", "Schema", placeholder="public"),
            ConnectorField("table_or_view", "Table / View", required=True, placeholder="fct_orders"),
            ConnectorField("username", "Read-only User", required=True, placeholder="decisionpilot_ro"),
            ConnectorField("password", "Password", field_type="password", secret=True),
        ],
    )

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        missing = [f.label for f in self.capability.config_fields if f.required and not str(config.get(f.name, "")).strip()]
        return [f"{label} is required for PostgreSQL connector." for label in missing]


class SqlServerConnector(DataSourceConnector):
    capability = ConnectorCapability(
        connector_type="sql_server",
        display_name="Microsoft SQL Server",
        category="database",
        status="extensible",
        description="Enterprise ODBC / TDS adapter for SQL Server ERP/accounting databases.",
        supported_formats=["sql_table", "sql_view"],
        config_fields=[
            ConnectorField("host", "Server Host", required=True, placeholder="mssql.company.internal"),
            ConnectorField("port", "Port", field_type="number", required=True, placeholder="1433"),
            ConnectorField("database", "Database", required=True, placeholder="EnterpriseERP"),
            ConnectorField("schema", "Schema", placeholder="dbo"),
            ConnectorField("table_or_view", "Table / View", required=True, placeholder="SalesTransactions"),
            ConnectorField("username", "Username", required=True),
            ConnectorField("password", "Password", field_type="password", secret=True),
        ],
    )

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        missing = [f.label for f in self.capability.config_fields if f.required and not str(config.get(f.name, "")).strip()]
        return [f"{label} is required for SQL Server connector." for label in missing]


class MySqlConnector(DataSourceConnector):
    capability = ConnectorCapability(
        connector_type="mysql",
        display_name="MySQL / MariaDB",
        category="database",
        status="extensible",
        description="Read-replica adapter for MySQL / MariaDB commerce and POS backends.",
        supported_formats=["sql_table", "sql_view"],
        config_fields=[
            ConnectorField("host", "Host", required=True, placeholder="mysql.company.internal"),
            ConnectorField("port", "Port", field_type="number", required=True, placeholder="3306"),
            ConnectorField("database", "Database", required=True, placeholder="ecommerce"),
            ConnectorField("table_or_view", "Table / View", required=True, placeholder="orders"),
            ConnectorField("username", "Username", required=True),
            ConnectorField("password", "Password", field_type="password", secret=True),
        ],
    )

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        missing = [f.label for f in self.capability.config_fields if f.required and not str(config.get(f.name, "")).strip()]
        return [f"{label} is required for MySQL connector." for label in missing]


class RestApiConnector(DataSourceConnector):
    capability = ConnectorCapability(
        connector_type="rest_api",
        display_name="REST API",
        category="api",
        status="extensible",
        description="Paginated JSON REST API adapter with bearer/header authentication and schema path extraction.",
        supported_formats=["json"],
        config_fields=[
            ConnectorField("base_url", "Endpoint URL", required=True, placeholder="https://api.partner.com/v1/orders"),
            ConnectorField("records_path", "Records JSON Path", placeholder="data.items"),
            ConnectorField("auth_type", "Auth Mode", field_type="select", options=["bearer", "api_key", "none"]),
            ConnectorField("api_token", "API Token / Key", field_type="password", secret=True),
        ],
    )

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        url = str(config.get("base_url", "")).strip()
        if not url.startswith(("https://", "http://")):
            return ["Endpoint URL must start with https:// or http://."]
        return []


class ErpCrmPosConnector(DataSourceConnector):
    capability = ConnectorCapability(
        connector_type="erp_crm_pos",
        display_name="ERP / CRM / POS Systems",
        category="erp_crm_pos",
        status="extensible",
        description="Unified business connector interface for Odoo, SAP Business One, KiotViet, Nhanh.vn, Haravan, Shopify POS, and HubSpot.",
        supported_formats=["api_sync", "webhook_batch"],
        config_fields=[
            ConnectorField(
                "provider_preset",
                "Platform",
                field_type="select",
                required=True,
                options=["Odoo ERP", "SAP Business One", "KiotViet POS", "Nhanh.vn", "Haravan", "Shopify POS", "HubSpot CRM"],
            ),
            ConnectorField("store_url", "Workspace / Store Domain", required=True, placeholder="acme.kiotviet.vn"),
            ConnectorField("sync_entity", "Entity Scope", field_type="select", options=["orders_and_items", "products_and_inventory", "marketing_spend"]),
            ConnectorField("client_secret", "Client Secret / Access Key", field_type="password", secret=True),
        ],
    )

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        missing = [f.label for f in self.capability.config_fields if f.required and not str(config.get(f.name, "")).strip()]
        return [f"{label} is required for ERP / CRM / POS connector." for label in missing]


CONNECTOR_REGISTRY: dict[str, DataSourceConnector] = {
    c.capability.connector_type: c
    for c in (
        FileUploadConnector(),
        PostgresConnector(),
        SqlServerConnector(),
        MySqlConnector(),
        RestApiConnector(),
        ErpCrmPosConnector(),
    )
}


def list_connectors() -> list[dict[str, Any]]:
    return [connector.capability.to_dict() for connector in CONNECTOR_REGISTRY.values()]


def get_connector(connector_type: str) -> DataSourceConnector:
    connector = CONNECTOR_REGISTRY.get(connector_type)
    if not connector:
        raise ValueError(f"Unsupported connector type '{connector_type}'.")
    return connector

