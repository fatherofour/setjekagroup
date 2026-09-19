from pydantic import BaseModel


class GroupRegroupRequest(BaseModel):
    elements: list[dict]
    group_by: list[str]
    sum_columns: list[str]


class CalibrateRequest(BaseModel):
    ref_p1: tuple[float, float]
    ref_p2: tuple[float, float]
    real_value: float
    unit: str = "m"
    page_width_pt: float
    page_height_pt: float
