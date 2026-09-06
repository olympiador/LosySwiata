export const POPULATION_GRID_WIDTH = 4320;
export const POPULATION_GRID_HEIGHT = 2160;
export const POPULATION_GRID_URL = "/population-2020-v1.bin";

let populationPromise: Promise<Float32Array> | null = null;

export function decodePopulationGrid(buffer: ArrayBuffer): Float32Array {
  if (buffer.byteLength !== POPULATION_GRID_WIDTH * POPULATION_GRID_HEIGHT * 4) throw new Error("Niepełna siatka ludności.");
  const view = new DataView(buffer);
  const result = new Float32Array(POPULATION_GRID_WIDTH * POPULATION_GRID_HEIGHT);
  for (let i = 0; i < result.length; i++) {
    const value = view.getFloat32(i * 4, true);
    if (!Number.isFinite(value) || value < 0) throw new Error("Uszkodzona siatka ludności.");
    result[i] = value;
  }
  return result;
}

export function loadPopulationGrid(): Promise<Float32Array> {
  if (!populationPromise) populationPromise = (async () => {
    try {
      const response = await fetch(POPULATION_GRID_URL);
      if (!response.ok || !response.body) throw new Error("Brak danych ludności.");
      const decoded = response.body.pipeThrough(new DecompressionStream("deflate"));
      return decodePopulationGrid(await new Response(decoded).arrayBuffer());
    } catch {
      // Jawnie oznaczony tryb awaryjny. Kolejna inicjalizacja może ponowić pobranie.
      populationPromise = null;
      return new Float32Array(0);
    }
  })();
  return populationPromise;
}
