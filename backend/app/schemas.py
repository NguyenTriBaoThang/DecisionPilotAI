"""Request boundaries for exposed decision tools and enterprise data ingestion."""
from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Slug = Annotated[str, Field(min_length=1,max_length=100)]
CurrencyCode = Literal["VND", "USD", "EUR", "GBP"]
ConnectorType = Literal["file_upload", "postgresql", "sql_server", "mysql", "rest_api", "erp_crm_pos"]
Horizon = Literal[7,30]
Objective = Literal["profit","revenue","stockout","balanced"]
Grain = Literal["daily","weekly","monthly"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Filters(Strict):
    start: date | None = None
    end: date | None = None
    product: Slug | None = None
    category: Slug | None = None
    region: Slug | None = None
    channel: Slug | None = None
    segment: Slug | None = None
    grain: Grain = "daily"

    def dimensions(self):
        return self.model_dump(exclude={"start","end","grain"},exclude_none=True)


class ForecastRequest(Strict):
    target: Literal["revenue","orders","demand"] = "revenue"
    product: Slug | None = None
    category: Slug | None = None
    horizon: Horizon = 30

    @model_validator(mode="after")
    def one_scope(self):
        if self.product and self.category:
            raise ValueError("Choose a product or category.")
        return self


class PriceParams(Strict):
    product: Slug
    discounts: list[Annotated[float,Field(ge=0,le=.50)]] = Field(default_factory=lambda:[0,.05,.10],min_length=1,max_length=8)
    elasticity: float | None = Field(default=None,ge=-5,le=0)
    additional_cost: int = Field(default=0,ge=0,le=10**10)


class MarketingParams(Strict):
    channel: Slug
    changes: list[Annotated[float,Field(ge=-1,le=2)]] = Field(default_factory=lambda:[-.15,.15,.30],min_length=1,max_length=8)
    response_exponent: float = Field(default=.65,ge=.2,le=.95)


class InventoryParams(Strict):
    product: Slug
    incoming_stock: int = Field(default=0,ge=0,le=1_000_000)
    arrival_day: int = Field(default=1,ge=1,le=90)
    safety_stock: int | None = Field(default=None,ge=0,le=1_000_000)
    order_quantities: list[Annotated[int,Field(ge=0,le=1_000_000)]] = Field(default_factory=list,max_length=8)


class PriceRequest(Strict):
    type: Literal["price"]
    objective: Objective = "profit"
    horizon: Horizon = 30
    parameters: PriceParams


class MarketingRequest(Strict):
    type: Literal["marketing"]
    objective: Objective = "profit"
    horizon: Horizon = 30
    parameters: MarketingParams

    @model_validator(mode="after")
    def no_stock_objective(self):
        if self.objective == "stockout":
            raise ValueError("Marketing simulation does not estimate stockout risk.")
        return self


class InventoryRequest(Strict):
    type: Literal["inventory"]
    objective: Objective = "stockout"
    horizon: Horizon = 30
    parameters: InventoryParams


ScenarioRequest = Annotated[PriceRequest | MarketingRequest | InventoryRequest, Field(discriminator="type")]


class Intent(Strict):
    action: Literal["kpi","trend","rank","explain","marketing","forecast","alerts","unsupported"]
    metric: Literal["revenue","gross_profit","margin","orders","units","aov","customers","new_customers",
                    "returning_customers","spend","roas","cac","conversion","inventory_availability"] = "revenue"
    dimension: Literal["product","category","region","channel","segment","marketing"] = "product"
    period: Literal["this_month","last_month","last_7","last_30","all","custom"] = "this_month"
    filters: Filters = Field(default_factory=Filters)
    marketing_channel: Slug | None = None
    horizon: Horizon = 30
    forecast_target: Literal["revenue","orders","demand"] = "revenue"
    ascending: bool = False
    compare_previous: bool = False


class Question(Strict):
    question: str = Field(min_length=3,max_length=500)
    context: Filters = Field(default_factory=Filters)


class Feedback(Strict):
    recommendation_id: Slug
    dataset_id: Annotated[str,Field(pattern=r"^[a-f0-9]{24}$")]
    decision: Literal["accepted","rejected"]


class ScenarioFeedback(Strict):
    simulation_id: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    dataset_id: Annotated[str, Field(pattern=r"^[a-f0-9]{24}$")]
    decision: Literal["accepted", "rejected"]
    recommendation_id: Slug | None = None


class QueryResponse(BaseModel):
    answer: str
    intent: Intent
    chart: dict | None = None
    evidence: dict
    trace: dict


class CompanyCreateRequest(Strict):
    name: Annotated[str, Field(min_length=2, max_length=120)]
    slug: Annotated[str | None, Field(min_length=2, max_length=60, pattern=r"^[a-z0-9][a-z0-9_-]*$")] = None
    activate: bool = True


class PreviewRequest(Strict):
    sheet_name: Annotated[str | None, Field(min_length=1, max_length=120)] = None
    limit: Annotated[int, Field(ge=1, le=500)] = 50


class ColumnMappingSaveRequest(Strict):
    mappings: dict[str, Annotated[str, Field(min_length=1, max_length=120)]]
    custom_fields: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(default_factory=list, max_length=50)
    sheet_name: Annotated[str | None, Field(min_length=1, max_length=120)] = None
    currency: CurrencyCode | None = None
    confirmed: bool = True
    save_template: bool = False
    template_name: Annotated[str | None, Field(min_length=2, max_length=120)] = None
    template_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None


class ValidateRequest(Strict):
    sheet_name: Annotated[str | None, Field(min_length=1, max_length=120)] = None
    mappings: dict[str, Annotated[str, Field(min_length=1, max_length=120)]] | None = None
    custom_fields: list[Annotated[str, Field(min_length=1, max_length=80)]] | None = None
    invalid_row_policy: Literal["skip_invalid", "fail_on_error"] = "skip_invalid"
    duplicate_policy: Literal["keep_all", "deduplicate"] = "keep_all"
    currency: CurrencyCode | None = None


class ImportConfirmRequest(Strict):
    confirmed: bool = True
    sheet_name: Annotated[str | None, Field(min_length=1, max_length=120)] = None
    invalid_row_policy: Literal["skip_invalid", "fail_on_error"] = "skip_invalid"
    duplicate_policy: Literal["keep_all", "deduplicate"] = "keep_all"
    currency: CurrencyCode | None = None
    activate: bool = True


class DataSourceCreateRequest(Strict):
    name: Annotated[str, Field(min_length=2, max_length=120)]
    source_type: ConnectorType
    config: dict[str, Any] = Field(default_factory=dict)


class DataSourceTestRequest(Strict):
    source_type: ConnectorType
    config: dict[str, Any] = Field(default_factory=dict)
    live_probe: bool = False


class ExtractionPatchRequest(Strict):
    corrected_data: dict[str, Any] | None = None
    validation_status: Literal["unverified", "needs_review", "edited", "approved", "rejected"] | None = None


class MultimodalApproveRequest(Strict):
    confirmed: bool = True
    record_ids: list[str] | None = None
    approve_below_threshold: bool = False
    activate: bool = True
    currency: CurrencyCode | None = None


class DataSourceSyncRequest(Strict):
    dataset_name: Annotated[str | None, Field(min_length=1, max_length=120)] = None
    watermark_column: Annotated[str | None, Field(min_length=1, max_length=64)] = None


class ChatCompletionRequest(Strict):
    message: Annotated[str, Field(min_length=1, max_length=4000)]
    conversation_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    dataset_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    language: Literal["auto", "en", "vi"] = "auto"
    top_k: Annotated[int, Field(ge=1, le=20)] = 5
    domain: Literal["sales", "finance", "marketing", "inventory", "operations", "executive", "general"] | None = None
    document_type: Annotated[str | None, Field(min_length=1, max_length=40)] = None
    stream: bool = False


class ConversationCreateRequest(Strict):
    title: Annotated[str, Field(min_length=1, max_length=200)] = "New Copilot Session"
    dataset_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    language: Literal["auto", "en", "vi"] = "auto"


class ConversationPatchRequest(Strict):
    title: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    is_pinned: bool | None = None
    dataset_id: Annotated[str | None, Field(max_length=64)] = None


class RagSearchRequest(Strict):
    query: Annotated[str, Field(min_length=1, max_length=1000)]
    dataset_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    domain: Literal["sales", "finance", "marketing", "inventory", "operations", "executive", "general"] | None = None
    document_type: Annotated[str | None, Field(min_length=1, max_length=40)] = None
    document_ids: list[Annotated[str, Field(min_length=1, max_length=64)]] | None = Field(default=None, max_length=20)
    top_k: Annotated[int, Field(ge=1, le=20)] = 5


class RagTextIngestRequest(Strict):
    title: Annotated[str, Field(min_length=2, max_length=200)]
    text: Annotated[str, Field(min_length=10, max_length=200_000)]
    dataset_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    domain: Literal["sales", "finance", "marketing", "inventory", "operations", "executive", "general"] | None = None
    document_type: Annotated[str, Field(min_length=1, max_length=40)] = "txt"
    chunking_strategy: Literal["auto", "recursive", "semantic", "structure"] = "auto"
    source_dataset_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    source_file_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None


class CompanyMemoryUpsertRequest(Strict):
    memory_key: Annotated[str, Field(min_length=2, max_length=120)]
    content: Annotated[str, Field(min_length=2, max_length=4000)]
    memory_type: Literal["business_context", "preference", "kpi_definition", "policy"] = "business_context"
    source_conversation_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = 1.0


