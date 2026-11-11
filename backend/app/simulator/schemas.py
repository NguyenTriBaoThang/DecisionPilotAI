"""Pydantic request & response contracts for the Interactive 3D Business Scenario Simulator."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ScenarioType = Literal[
    "baseline",
    "revenue_growth",
    "marketing_optimization",
    "pricing_strategy",
    "inventory_optimization",
    "customer_retention",
    "cost_reduction",
    "supply_chain_disruption",
    "custom",
]

TwinObjective = Literal["profit", "revenue", "stockout", "margin", "resilience", "balanced"]


class TwinStrict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class ConstraintConfig(TwinStrict):
    min_margin: float | None = Field(default=None, ge=-1.0, le=1.0)
    max_stockout_risk_units: float | None = Field(default=None, ge=0.0, le=10_000_000.0)
    max_spend_increase_pct: float | None = Field(default=None, ge=-100.0, le=1_000.0)
    max_cost_pct: float | None = Field(default=None, ge=0.0, le=100.0)


class VariablePatchItem(TwinStrict):
    variable_name: str = Field(min_length=1, max_length=80)
    scenario_value: float | None = None
    baseline_value: float | None = None
    source_or_assumption: str | None = Field(default=None, max_length=200)


class ScenarioVariablesPatchRequest(TwinStrict):
    variables: list[VariablePatchItem] = Field(min_length=1, max_length=40)


class ScenarioCreateRequest(TwinStrict):
    name: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1000)
    scenario_type: ScenarioType = "revenue_growth"
    objective: TwinObjective = "balanced"
    horizon_days: Literal[7, 30, 90] = 30
    dataset_id: str | None = Field(default=None, max_length=64)
    baseline_reference: str | None = Field(default=None, max_length=64)
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)
    configuration: dict[str, Any] = Field(default_factory=dict)
    variables_overrides: dict[str, float | None] = Field(default_factory=dict)


class ScenarioUpdateRequest(TwinStrict):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1000)
    objective: TwinObjective | None = None
    horizon_days: Literal[7, 30, 90] | None = None
    constraints: ConstraintConfig | None = None
    configuration: dict[str, Any] | None = None


class SimulationRunCreateRequest(TwinStrict):
    execution_mode: Literal["async", "sync"] = "async"
    inject_failure: bool = False
    focus_scope: dict[str, Any] = Field(default_factory=dict)
    step_delay_ms: int = Field(default=0, ge=0, le=500)


class CompareScenariosRequest(TwinStrict):
    scenario_ids: list[str] = Field(min_length=2, max_length=6)
    objective: TwinObjective = "balanced"
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)
    sensitivity_variable: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def unique_scenarios(self):
        self.scenario_ids = list(dict.fromkeys(self.scenario_ids))
        if len(self.scenario_ids) < 2:
            raise ValueError("Provide at least 2 distinct scenarios to compare.")
        return self


class RecommendRequest(TwinStrict):
    language: Literal["en", "vi"] = "en"
    custom_focus: str | None = Field(default=None, max_length=300)

