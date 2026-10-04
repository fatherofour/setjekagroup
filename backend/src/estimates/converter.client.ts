import { BadGatewayException, Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';

export interface ModelGroupItem {
  type: string;
  material: string;
  count: number;
  volume_m3: number;
  area_m2: number;
  length_m: number;
}

export interface ModelGroup {
  category: string;
  items: ModelGroupItem[];
  totals: { count: number; volume_m3: number; area_m2: number; length_m: number };
}

export interface ConvertedModel {
  format: string;
  total_elements: number;
  groups: ModelGroup[];
}

export const MODEL_EXTENSIONS = ['ifc', 'rvt', 'dwg', 'dgn', 'dxf', 'rfa'];

/** Calls the converter microservice (converter-service/, FastAPI), which
 * turns BIM and CAD files into quantities grouped by category and type.
 * It sits on the internal network and is the backend's to call alone. */
@Injectable()
export class ConverterClient {
  private get base() {
    return (process.env.CONVERTER_URL ?? 'http://localhost:8100').replace(/\/$/, '');
  }

  private get token() {
    return process.env.CONVERTER_INTERNAL_TOKEN ?? 'dev-converter-token-change-me';
  }

  async status() {
    try {
      const res = await fetch(`${this.base}/converters`, { headers: { 'X-Internal-Token': this.token }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { reachable: true, converters: null, error: `Converter answered ${res.status}` };
      return { reachable: true, converters: await res.json(), error: null };
    } catch {
      return { reachable: false, converters: null, error: 'The model converter service is not running' };
    }
  }

  async convert(fileName: string, content: Buffer): Promise<ConvertedModel> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(content)]), fileName);
    let res: Response;
    try {
      res = await fetch(`${this.base}/convert/bim`, {
        method: 'POST',
        headers: { 'X-Internal-Token': this.token },
        body: form,
        // Large Revit files can take minutes to export.
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
    } catch {
      throw new ServiceUnavailableException('The model converter service is not running, so the model could not be read. Start it and try again.');
    }
    if (res.ok) return (await res.json()) as ConvertedModel;
    const detail = await res
      .json()
      .then((j: { detail?: unknown }) => (typeof j.detail === 'string' ? j.detail : null))
      .catch(() => null);
    if (res.status === 400 || res.status === 413 || res.status === 422) throw new UnprocessableEntityException(detail ?? 'The model could not be read');
    throw new BadGatewayException(detail ?? `The converter failed (${res.status})`);
  }
}
