import dataclasses
import tempfile
from pathlib import Path

import numpy as np
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile

from .config import get_settings
from .engines import cad_import, pdf_extract_worker, plan_read, raster_recognize, recognize, scale_detect
from .schemas import CalibrateRequest, GroupRegroupRequest
from .security import require_internal_token

app = FastAPI(title="Setjeka Converter Service", version="0.1.0")

BIM_EXTENSIONS = {"rvt", "ifc", "dwg", "dgn", "rfa", "dxf"}
DDC_FORMATS = ("rvt", "ifc", "dwg", "dgn")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/converters", dependencies=[Depends(require_internal_token)])
async def converters_status() -> dict:
    result: dict[str, dict] = {}
    for ext in DDC_FORMATS:
        exe = cad_import.find_converter(ext)
        result[ext] = {
            "installed": exe is not None,
            "path": str(exe) if exe else None,
            "health": cad_import.smoke_test_converter(ext),
            "version": cad_import.detect_converter_version(ext),
        }
    return result


@app.post("/convert/bim", dependencies=[Depends(require_internal_token)])
async def convert_bim(file: UploadFile = File(...)) -> dict:
    """Convert a BIM/CAD file (.rvt/.ifc/.dwg/.dgn/.rfa/.dxf) into grouped quantities.

    .dxf is read natively (no converter binary needed); the other formats
    need the matching DDC converter installed on this machine - see
    GET /converters.
    """
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in BIM_EXTENSIONS:
        raise HTTPException(400, f"Unsupported extension .{ext}. Supported: {sorted(BIM_EXTENSIONS)}")

    settings = get_settings()
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds the {settings.max_upload_mb} MB limit.")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        input_path = tmp_path / (file.filename or f"upload.{ext}")
        input_path.write_bytes(content)

        excel_path = await cad_import.convert_cad_to_excel(input_path, tmp_path, ext)
        if excel_path is None:
            raise HTTPException(
                422,
                "Conversion failed - either the matching converter isn't installed on this "
                "machine (see GET /converters) or the file could not be parsed.",
            )

        elements = cad_import.parse_cad_excel(excel_path)

    grouped = cad_import.group_cad_elements(elements)
    columns = cad_import.get_available_columns(elements, file_format=ext)

    return {
        "format": ext,
        "total_elements": grouped["total_elements"],
        "groups": grouped["groups"],
        "grand_totals": grouped["grand_totals"],
        "available_columns": columns,
        "elements": elements,
    }


@app.post("/convert/bim/group", dependencies=[Depends(require_internal_token)])
async def regroup_bim(body: GroupRegroupRequest) -> dict:
    """Re-group a previously-converted element list by different columns.

    Stateless: the caller re-sends the `elements` array returned by
    POST /convert/bim rather than this service persisting anything.
    """
    return cad_import.group_cad_elements_dynamic(body.elements, body.group_by, body.sum_columns)


def _scale_candidate_dict(candidate: scale_detect.ScaleCandidate | None) -> dict | None:
    return dataclasses.asdict(candidate) if candidate is not None else None


@app.post("/convert/pdf", dependencies=[Depends(require_internal_token)])
async def convert_pdf(
    file: UploadFile = File(...),
    page: int = Form(1),
    scale_pixels_per_unit: float | None = Form(None),
) -> dict:
    """Extract measurable candidates (areas/lengths/counts) from one page of a PDF plan.

    Vector-drawn pages are read directly (deterministic geometry); a page with
    no vector layer (a scanned/raster plan) falls back to OpenCV-based room
    and wall detection. `scale_pixels_per_unit` is optional - omit it to get
    geometry-only candidates (`value: null`) for the caller to calibrate via
    POST /convert/pdf/calibrate, then re-request with the derived scale.
    """
    try:
        import pymupdf
    except ImportError as exc:
        raise HTTPException(500, "PyMuPDF is not installed on this service.") from exc

    settings = get_settings()
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds the {settings.max_upload_mb} MB limit.")

    detected_scale: dict | None = None
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp) / (file.filename or "upload.pdf")
        tmp_path.write_bytes(content)

        try:
            text_result = pdf_extract_worker.extract_pdf_data(str(tmp_path))
            best, ranked = scale_detect.detect_best_scale(text_result.get("pages", []))
            detected_scale = {
                "best": _scale_candidate_dict(best),
                "candidates": [_scale_candidate_dict(c) for c in ranked],
            }
        except Exception:
            detected_scale = None

        doc = pymupdf.open(str(tmp_path))
        try:
            page_count = doc.page_count
            if page < 1 or page > page_count:
                raise HTTPException(400, f"Page {page} out of range (document has {page_count} pages).")

            pg = doc[page - 1]
            drawings = pg.get_drawings()
            page_w_pt = float(pg.rect.width)
            page_h_pt = float(pg.rect.height)

            if drawings:
                candidates = recognize.recognize_candidates(drawings, scale_pixels_per_unit)
                source = "vector"
            else:
                pix = pg.get_pixmap(dpi=settings.raster_dpi, alpha=False)
                arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
                image_bgr = np.ascontiguousarray(arr[:, :, 2::-1]) if pix.n >= 3 else arr.reshape(pix.h, pix.w)
                candidates = raster_recognize.recognize_raster(image_bgr, page_w_pt, page_h_pt, scale_pixels_per_unit)
                source = "raster"
        finally:
            doc.close()

    return {
        "page": page,
        "page_count": page_count,
        "page_width_pt": page_w_pt,
        "page_height_pt": page_h_pt,
        "source": source,
        "candidates": candidates,
        "detected_scale": detected_scale,
    }


@app.post("/convert/pdf/calibrate", dependencies=[Depends(require_internal_token)])
async def calibrate(body: CalibrateRequest) -> dict:
    """Derive `scale_pixels_per_unit` from two reference points of known real-world length.

    Mirrors the calibration step a human does once per plan (draw a line over
    a dimension you can read, tell it the real length) - the same mechanism
    the donor app used, just exposed as its own endpoint here.
    """
    ratio = plan_read.derive_scale_ratio(body.ref_p1, body.ref_p2, body.real_value, body.unit)
    if ratio is None:
        raise HTTPException(400, "Could not derive a scale - the reference points coincide or real_value is not positive.")
    plausible = plan_read.scale_is_plausible(ratio, body.page_width_pt, body.page_height_pt)
    return {"scale_pixels_per_unit": ratio, "plausible": plausible}
