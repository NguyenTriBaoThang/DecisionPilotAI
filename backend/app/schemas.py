"""Request boundaries for exposed decision tools."""
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Slug = Annotated[str, Field(min_length=1,max_length=100)]
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


class QueryResponse(BaseModel):
    answer: str
    intent: Intent
    chart: dict | None = None
    evidence: dict
    trace: dict
