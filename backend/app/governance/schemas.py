"""Strict Pydantic request schemas for Enterprise Recommendations Workflow & Audit Governance."""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictGovernanceModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


WorkflowActionType = Literal[
    "approve",
    "reject",
    "request_review",
    "mark_implemented",
    "comment",
    "update_plan",
]


class RecommendationActionRequest(StrictGovernanceModel):
    action: WorkflowActionType
    comment: Annotated[str | None, Field(max_length=2000)] = None
    owner: Annotated[str | None, Field(max_length=120)] = None
    deadline: date | None = None
    resources_needed: Annotated[str | None, Field(max_length=1000)] = None
    tracking_kpi: Annotated[str | None, Field(max_length=120)] = None
    success_criteria: Annotated[str | None, Field(max_length=1000)] = None
    stop_criteria: Annotated[str | None, Field(max_length=1000)] = None


OutcomeEvaluationStatus = Literal["not_evaluated", "successful", "unsuccessful", "inconclusive"]


class RecommendationOutcomeRequest(StrictGovernanceModel):
    evaluation_status: OutcomeEvaluationStatus
    kpi_name: Annotated[str, Field(min_length=2, max_length=120)]
    baseline_value: float | None = None
    target_value: float | None = None
    observed_value: float | None = None
    observation_window_days: Annotated[int | None, Field(ge=1, le=365)] = None
    methodology: Annotated[str, Field(min_length=3, max_length=1000)] = (
        "Pre/post observed KPI comparison against baseline window"
    )
    notes: Annotated[str | None, Field(max_length=2000)] = None


class RiskResolveRequest(StrictGovernanceModel):
    status: Literal["open", "acknowledged", "resolved"]
    note: Annotated[str | None, Field(max_length=1000)] = None

