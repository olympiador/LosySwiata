type MapView = { zoom: number; panX: number; panY: number; selectedOwner?: number; selectedRegion?: number; interacting?: boolean };

export interface MapRenderer {
  readonly kind: "GPU" | "2D";
  readonly screenSpaceBorders: boolean;
  resize(cssWidth: number, cssHeight: number, ratio: number): void;
  upload(map: HTMLCanvasElement, outline: HTMLCanvasElement, identity?: HTMLCanvasElement, administrative?: HTMLCanvasElement, preprojected?: boolean): void;
  draw(view: MapView): void;
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_screen;
void main() {
  v_screen = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_map;
uniform sampler2D u_outline;
uniform sampler2D u_identity;
uniform sampler2D u_administrative;
uniform float u_zoom;
uniform float u_selectedOwner;
uniform float u_selectedRegion;
uniform float u_interacting;
uniform vec2 u_pan;
uniform vec2 u_viewSize;
in vec2 v_screen;
out vec4 outColor;
vec2 safeUv(vec2 uv) { return vec2(fract(uv.x), clamp(uv.y, 0.0, 1.0)); }
ivec2 safeTexel(ivec2 cell, ivec2 size) {
  int x = cell.x % size.x;
  if (x < 0) x += size.x;
  return ivec2(x, clamp(cell.y, 0, size.y - 1));
}
vec2 rawIdentityAt(ivec2 cell, ivec2 size) {
  vec3 raw = floor(texelFetch(u_identity, safeTexel(cell, size), 0).rgb * 255.0 + .5);
  return vec2(raw.r, raw.g + raw.b * 256.0);
}
float rawAdministrativeAt(ivec2 cell, ivec2 size) {
  vec3 raw = floor(texelFetch(u_administrative, safeTexel(cell, size), 0).rgb * 255.0 + .5);
  return raw.r + raw.g * 256.0 + raw.b * 65536.0;
}
vec4 categoryMask(float value, vec4 values) {
  return vec4(1.0) - step(vec4(.1), abs(values - vec4(value)));
}
float categoryWinner(vec4 values, vec4 weights) {
  float best = values.x;
  float bestScore = dot(categoryMask(best, values), weights);
  float score = dot(categoryMask(values.y, values), weights);
  if (score > bestScore) { best = values.y; bestScore = score; }
  score = dot(categoryMask(values.z, values), weights);
  if (score > bestScore) { best = values.z; bestScore = score; }
  score = dot(categoryMask(values.w, values), weights);
  if (score > bestScore) best = values.w;
  return best;
}
vec4 cubicWeights(float value) {
  float inverse = 1.0 - value;
  float value2 = value * value;
  float value3 = value2 * value;
  return vec4(
    inverse * inverse * inverse,
    3.0 * value3 - 6.0 * value2 + 4.0,
    -3.0 * value3 + 3.0 * value2 + 3.0 * value + 1.0,
    value3
  ) / 6.0;
}
// A four-texel cubic footprint removes the staircase created when the
// simulation grid is magnified. Only the four labels touching the fragment
// can win, so a border stays categorical and never invents a new country.
float smoothedOwnerAt(vec2 uv, out vec2 sourceUv, out float margin) {
  ivec2 size = textureSize(u_identity, 0);
  vec2 position = safeUv(uv) * vec2(size) - vec2(.5);
  ivec2 cell = ivec2(floor(position));
  vec2 fraction = fract(position);
  ivec2 ca = cell, cb = cell + ivec2(1, 0), cc = cell + ivec2(0, 1), cd = cell + ivec2(1, 1);
  vec4 candidates = vec4(rawIdentityAt(ca, size).x, rawIdentityAt(cb, size).x, rawIdentityAt(cc, size).x, rawIdentityAt(cd, size).x);
  vec4 wx = cubicWeights(fraction.x), wy = cubicWeights(fraction.y);
  vec4 support = vec4(0.0);
  for (int row = 0; row < 4; row++) {
    for (int column = 0; column < 4; column++) {
      float owner = rawIdentityAt(cell + ivec2(column - 1, row - 1), size).x;
      support += categoryMask(owner, candidates) * wx[column] * wy[row];
    }
  }
  float winner = candidates.x, best = support.x;
  if (support.y > best) { winner = candidates.y; best = support.y; }
  if (support.z > best) { winner = candidates.z; best = support.z; }
  if (support.w > best) { winner = candidates.w; best = support.w; }
  float second = 0.0;
  if (abs(candidates.x - winner) > .1) second = max(second, support.x);
  if (abs(candidates.y - winner) > .1) second = max(second, support.y);
  if (abs(candidates.z - winner) > .1) second = max(second, support.z);
  if (abs(candidates.w - winner) > .1) second = max(second, support.w);
  margin = max(0.0, best - second);

  vec4 bilinear = vec4((1.0 - fraction.x) * (1.0 - fraction.y), fraction.x * (1.0 - fraction.y), (1.0 - fraction.x) * fraction.y, fraction.x * fraction.y);
  ivec2 chosen = ca;
  float peak = candidates.x == winner ? bilinear.x : -1.0;
  if (candidates.y == winner && bilinear.y > peak) { chosen = cb; peak = bilinear.y; }
  if (candidates.z == winner && bilinear.z > peak) { chosen = cc; peak = bilinear.z; }
  if (candidates.w == winner && bilinear.w > peak) chosen = cd;
  chosen = safeTexel(chosen, size);
  sourceUv = (vec2(chosen) + vec2(.5)) / vec2(size);
  return winner;
}
// Reconstruct categorical borders between cell centres. This is a multi-label
// marching-squares pass: ownership, province and district are resolved in
// order, so smoothing never leaks a province into another country.
vec3 visualIdsAt(vec2 uv, out vec2 sourceUv) {
  if (u_zoom < 2.15) {
    vec2 cleanUv = safeUv(uv);
    vec3 identityRaw = floor(texture(u_identity, cleanUv).rgb * 255.0 + .5);
    vec3 adminRaw = floor(texture(u_administrative, cleanUv).rgb * 255.0 + .5);
    sourceUv = cleanUv;
    return vec3(identityRaw.r, identityRaw.g + identityRaw.b * 256.0, adminRaw.r + adminRaw.g * 256.0 + adminRaw.b * 65536.0);
  }
  ivec2 size = textureSize(u_identity, 0);
  vec2 position = safeUv(uv) * vec2(size) - vec2(.5);
  ivec2 cell = ivec2(floor(position));
  vec2 f = fract(position);
  ivec2 ca = cell, cb = cell + ivec2(1, 0), cc = cell + ivec2(0, 1), cd = cell + ivec2(1, 1);
  vec2 ia = rawIdentityAt(ca, size), ib = rawIdentityAt(cb, size), ic = rawIdentityAt(cc, size), id = rawIdentityAt(cd, size);
  vec4 owners = vec4(ia.x, ib.x, ic.x, id.x);
  vec4 regions = vec4(ia.y, ib.y, ic.y, id.y);
  vec4 administrative = vec4(rawAdministrativeAt(ca, size), rawAdministrativeAt(cb, size), rawAdministrativeAt(cc, size), rawAdministrativeAt(cd, size));
  vec4 weights = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  float owner = categoryWinner(owners, weights);
  vec4 ownerWeights = weights * categoryMask(owner, owners);
  float region = categoryWinner(regions, ownerWeights);
  vec4 regionWeights = ownerWeights * categoryMask(region, regions);
  float admin = categoryWinner(administrative, regionWeights);
  vec4 finalWeights = regionWeights * categoryMask(admin, administrative);
  int corner = 0;
  float peak = finalWeights.x;
  if (finalWeights.y > peak) { corner = 1; peak = finalWeights.y; }
  if (finalWeights.z > peak) { corner = 2; peak = finalWeights.z; }
  if (finalWeights.w > peak) corner = 3;
  ivec2 chosen = corner == 0 ? ca : corner == 1 ? cb : corner == 2 ? cc : cd;
  chosen = safeTexel(chosen, size);
  sourceUv = (vec2(chosen) + vec2(.5)) / vec2(size);
  return vec3(owner, region, admin);
}
void main() {
  vec2 world = vec2(.5) + (v_screen - vec2(.5) - u_pan) / u_zoom;
  world.x = fract(world.x);
  world.y = clamp(world.y, 0.0, 1.0);
  // Keep the same cubic ownership contour while moving, but skip secondary
  // province and administrative passes. This prevents the old switch to a
  // blurry linearly enlarged bitmap without paying the full static cost.
  if (u_interacting > .5) {
    vec2 movingSourceUv;
    float movingMargin;
    vec4 movingColour;
    if (u_zoom < 2.15) movingColour = texture(u_map, world);
    else {
      smoothedOwnerAt(world, movingSourceUv, movingMargin);
      movingColour = texture(u_map, movingSourceUv);
      float movingLine = 1.0 - smoothstep(0.0, max(.0001, fwidth(movingMargin) * 1.35), movingMargin);
      movingColour.rgb = mix(movingColour.rgb, vec3(.012, .045, .058), .9 * movingLine);
    }
    if (u_selectedRegion > 0.0) {
      vec3 raw = floor(texture(u_identity, world).rgb * 255.0 + .5);
      float movingRegion = raw.g + raw.b * 256.0;
      if (movingRegion == u_selectedRegion) movingColour.rgb = mix(movingColour.rgb, vec3(.02, .72, .86), .18);
    }
    outColor = vec4(movingColour.rgb, 1.0);
    return;
  }
  vec2 identityUv;
  vec3 currentIdentity = visualIdsAt(world, identityUv);
  float rawCurrentOwner = currentIdentity.r;
  float ownerMargin = 1.0;
  vec2 ownerSourceUv = identityUv;
  if (u_zoom >= 2.15) currentIdentity.r = smoothedOwnerAt(world, ownerSourceUv, ownerMargin);
  // At close range the colour comes from a texel belonging to the smoothed
  // winner. This keeps fills solid while their contour follows the cubic
  // reconstruction instead of the square simulation cells.
  vec4 base = texture(u_map, u_zoom < 2.15 ? world : ownerSourceUv);
  vec4 outline = texture(u_outline, world);
  vec3 colour = mix(base.rgb, outline.rgb, outline.a);
  vec2 screenStep = vec2(1.0 / max(1.0, u_viewSize.x * u_zoom), 1.0 / max(1.0, u_viewSize.y * u_zoom));
  vec2 ignored;
  vec3 leftIdentity = visualIdsAt(world - vec2(screenStep.x * .72, 0.0), ignored);
  vec3 rightIdentity = visualIdsAt(world + vec2(screenStep.x * .72, 0.0), ignored);
  vec3 topIdentity = visualIdsAt(world - vec2(0.0, screenStep.y * .72), ignored);
  vec3 bottomIdentity = visualIdsAt(world + vec2(0.0, screenStep.y * .72), ignored);
  bool ownerBoundary = ((leftIdentity.r != rawCurrentOwner) && (leftIdentity.r > 0.0 || rawCurrentOwner > 0.0)) ||
    ((rightIdentity.r != rawCurrentOwner) && (rightIdentity.r > 0.0 || rawCurrentOwner > 0.0)) ||
    ((topIdentity.r != rawCurrentOwner) && (topIdentity.r > 0.0 || rawCurrentOwner > 0.0)) ||
    ((bottomIdentity.r != rawCurrentOwner) && (bottomIdentity.r > 0.0 || rawCurrentOwner > 0.0));
  bool regionBoundary = currentIdentity.g > 0.0 && ((leftIdentity.r == rawCurrentOwner && leftIdentity.g > 0.0 && leftIdentity.g != currentIdentity.g) ||
    (rightIdentity.r == rawCurrentOwner && rightIdentity.g > 0.0 && rightIdentity.g != currentIdentity.g) ||
    (topIdentity.r == rawCurrentOwner && topIdentity.g > 0.0 && topIdentity.g != currentIdentity.g) ||
    (bottomIdentity.r == rawCurrentOwner && bottomIdentity.g > 0.0 && bottomIdentity.g != currentIdentity.g));
  bool adminBoundary = currentIdentity.b > 0.0 && ((leftIdentity.r == rawCurrentOwner && leftIdentity.b > 0.0 && leftIdentity.b != currentIdentity.b) ||
    (rightIdentity.r == rawCurrentOwner && rightIdentity.b > 0.0 && rightIdentity.b != currentIdentity.b) ||
    (topIdentity.r == rawCurrentOwner && topIdentity.b > 0.0 && topIdentity.b != currentIdentity.b) ||
    (bottomIdentity.r == rawCurrentOwner && bottomIdentity.b > 0.0 && bottomIdentity.b != currentIdentity.b));
  // Attack targets use a one-screen-pixel inner contour. It is deliberately
  // derived here rather than baked into the map texture, so 1200% zoom cannot
  // magnify a one-pixel line into a wide red band.
  bool targetSelected = u_selectedRegion > 0.0 && currentIdentity.g == u_selectedRegion;
  bool targetBoundary = targetSelected &&
    (leftIdentity.g != currentIdentity.g || rightIdentity.g != currentIdentity.g || topIdentity.g != currentIdentity.g || bottomIdentity.g != currentIdentity.g);
  // A slightly wider sample makes the focus contour remain clear on a bright
  // political fill, without baking a thick band into the map texture.
  vec3 farLeftIdentity = visualIdsAt(world - vec2(screenStep.x * 2.15, 0.0), ignored);
  vec3 farRightIdentity = visualIdsAt(world + vec2(screenStep.x * 2.15, 0.0), ignored);
  vec3 farTopIdentity = visualIdsAt(world - vec2(0.0, screenStep.y * 2.15), ignored);
  vec3 farBottomIdentity = visualIdsAt(world + vec2(0.0, screenStep.y * 2.15), ignored);
  bool targetFocusEdge = targetSelected &&
    (farLeftIdentity.g != currentIdentity.g || farRightIdentity.g != currentIdentity.g || farTopIdentity.g != currentIdentity.g || farBottomIdentity.g != currentIdentity.g);
  bool selected = u_selectedOwner > 0.0 && currentIdentity.r == u_selectedOwner;

  // Administrative detail is deliberately subordinate to the political map.
  // It fades in only at close range; selecting a country reveals its own
  // structure a little earlier without cluttering the rest of the world.
  float adminVisibility = smoothstep(6.3, 6.7, u_zoom);
  if (selected) adminVisibility = max(adminVisibility, smoothstep(5.0, 5.4, u_zoom));
  if (adminVisibility > 0.0 && adminBoundary) {
    float strength = selected ? .38 : .22;
    colour = mix(colour, vec3(.09, .14, .16), strength * adminVisibility);
  }

  float regionVisibility = smoothstep(3.35, 3.55, u_zoom);
  if (selected) regionVisibility = max(regionVisibility, smoothstep(2.1, 2.4, u_zoom));
  if (regionVisibility > 0.0 && regionBoundary) {
    float strength = selected ? .58 : .36;
    colour = mix(colour, vec3(.055, .105, .12), strength * regionVisibility);
  }

  // Country borders are the only lines visible at the world/continent scale.
  // One narrow dark pass avoids the old double-sided gold "pipes".
  float ownerLine = u_zoom < 2.15
    ? (ownerBoundary ? 1.0 : 0.0)
    : 1.0 - smoothstep(0.0, max(.0001, fwidth(ownerMargin) * 1.35), ownerMargin);
  if (ownerLine > 0.0) colour = mix(colour, vec3(.012, .045, .058), .9 * ownerLine);
  // Focus is communicated by a gentle warm wash over the whole sector and a
  // A restrained steel-blue focus is visible over every political colour
  // without a broad glow or the former alarm-like red outline.
  if (targetSelected) colour = mix(colour, vec3(.02, .72, .86), .18);
  if (targetFocusEdge) colour = mix(colour, vec3(.02, .88, .92), .94);
  if (targetBoundary) colour = mix(colour, vec3(.93, 1.0, 1.0), 1.0);
  outColor = vec4(colour, 1.0);
}`;

function shader(gl: WebGL2RenderingContext, type: number, source: string) {
  const result = gl.createShader(type);
  if (!result) throw new Error("Nie udało się utworzyć shadera mapy");
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) ?? "Błąd shadera mapy");
  return result;
}

/**
 * A persistent GPU map surface. The political world is uploaded only after a
 * turn/style change. Panning and zooming then change two uniforms, so a drag
 * never exposes a stale bitmap and never asks the CPU to rebuild millions of
 * pixels. Longitude wraps in the fragment shader without a visible seam.
 */
export class WebGLMapRenderer {
  readonly kind = "GPU" as const;
  readonly screenSpaceBorders = true;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly mapTexture: WebGLTexture;
  private readonly outlineTexture: WebGLTexture;
  private readonly identityTexture: WebGLTexture;
  private readonly administrativeTexture: WebGLTexture;
  private readonly zoomLocation: WebGLUniformLocation;
  private readonly selectedOwnerLocation: WebGLUniformLocation;
  private readonly selectedRegionLocation: WebGLUniformLocation;
  private readonly interactingLocation: WebGLUniformLocation;
  private readonly panLocation: WebGLUniformLocation;
  private readonly viewSizeLocation: WebGLUniformLocation;
  private hasTexture = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, desynchronized: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 jest niedostępny");
    this.gl = gl;
    const program = gl.createProgram();
    if (!program) throw new Error("Nie udało się utworzyć programu mapy");
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Błąd programu mapy");
    this.program = program;
    const mapTexture = gl.createTexture(), outlineTexture = gl.createTexture(), identityTexture = gl.createTexture(), administrativeTexture = gl.createTexture();
    const zoomLocation = gl.getUniformLocation(program, "u_zoom"), selectedOwnerLocation = gl.getUniformLocation(program, "u_selectedOwner"), selectedRegionLocation = gl.getUniformLocation(program, "u_selectedRegion"), interactingLocation = gl.getUniformLocation(program, "u_interacting"), panLocation = gl.getUniformLocation(program, "u_pan"), viewSizeLocation = gl.getUniformLocation(program, "u_viewSize");
    if (!mapTexture || !outlineTexture || !identityTexture || !administrativeTexture || !zoomLocation || !selectedOwnerLocation || !selectedRegionLocation || !interactingLocation || !panLocation || !viewSizeLocation) throw new Error("Nie udało się przygotować tekstur mapy");
    this.mapTexture = mapTexture;
    this.outlineTexture = outlineTexture;
    this.identityTexture = identityTexture;
    this.administrativeTexture = administrativeTexture;
    this.zoomLocation = zoomLocation;
    this.selectedOwnerLocation = selectedOwnerLocation;
    this.selectedRegionLocation = selectedRegionLocation;
    this.interactingLocation = interactingLocation;
    this.panLocation = panLocation;
    this.viewSizeLocation = viewSizeLocation;

    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "u_map"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "u_outline"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "u_identity"), 2);
    gl.uniform1i(gl.getUniformLocation(program, "u_administrative"), 3);
  }

  resize(cssWidth: number, cssHeight: number, ratio: number) {
    const width = Math.max(2, Math.round(cssWidth * ratio));
    const height = Math.max(2, Math.round(cssHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.viewSizeLocation, cssWidth, cssHeight);
  }

  private uploadTexture(unit: number, texture: WebGLTexture, source: HTMLCanvasElement, nearest = false) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  upload(map: HTMLCanvasElement, outline: HTMLCanvasElement, identity?: HTMLCanvasElement, administrative?: HTMLCanvasElement, preprojected?: boolean) {
    // The categorical identity textures remain exact. The visible colour
    // layer is linearly filtered so motion and coastlines never reveal the
    // source raster; close-up ownership still comes from visualIdsAt().
    this.uploadTexture(0, this.mapTexture, map);
    this.uploadTexture(1, this.outlineTexture, outline);
    if (identity) this.uploadTexture(2, this.identityTexture, identity, true);
    if (administrative) this.uploadTexture(3, this.administrativeTexture, administrative, true);
    this.hasTexture = true;
  }

  draw({ zoom, panX, panY, selectedOwner = 0, selectedRegion = 0, interacting = false }: MapView) {
    if (!this.hasTexture) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform1f(this.zoomLocation, zoom);
    gl.uniform1f(this.selectedOwnerLocation, selectedOwner);
    gl.uniform1f(this.selectedRegionLocation, selectedRegion);
    gl.uniform1f(this.interactingLocation, interacting ? 1 : 0);
    gl.uniform2f(this.panLocation, panX, panY);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

class Canvas2DMapRenderer implements MapRenderer {
  readonly kind = "2D" as const;
  readonly screenSpaceBorders = false;
  private readonly context: CanvasRenderingContext2D;
  private map: HTMLCanvasElement | null = null;
  private outline: HTMLCanvasElement | null = null;
  private preprojected = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) throw new Error("Renderer 2D jest niedostępny");
    this.context = context;
  }

  resize(cssWidth: number, cssHeight: number, ratio: number) {
    const width = Math.max(2, Math.round(cssWidth * ratio));
    const height = Math.max(2, Math.round(cssHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  upload(map: HTMLCanvasElement, outline: HTMLCanvasElement, _identity?: HTMLCanvasElement, _administrative?: HTMLCanvasElement, preprojected = false) {
    this.map = map;
    this.outline = outline;
    this.preprojected = preprojected;
  }

  draw({ zoom, panX, panY }: MapView) {
    if (!this.map || !this.outline) return;
    const context = this.context, width = this.canvas.width, height = this.canvas.height;
    if (this.preprojected) {
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.drawImage(this.map, 0, 0, width, height);
      context.drawImage(this.outline, 0, 0, width, height);
      return;
    }
    const worldWidth = width * zoom, worldHeight = height * zoom;
    const originX = width / 2 + panX * width - worldWidth / 2;
    const originY = height / 2 + panY * height - worldHeight / 2;
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = zoom < 8;
    const firstWrap = Math.floor((-originX - worldWidth) / worldWidth);
    const lastWrap = Math.ceil((width - originX + worldWidth) / worldWidth);
    for (let wrap = firstWrap; wrap <= lastWrap; wrap++) {
      const x = originX + wrap * worldWidth;
      context.drawImage(this.map, x, originY, worldWidth, worldHeight);
      context.drawImage(this.outline, x, originY, worldWidth, worldHeight);
    }
  }
}

/** Select the GPU path when the browser exposes WebGL2, otherwise keep the
 * game usable with a seam-free 2D fallback instead of showing a blank map. */
export function createMapRenderer(canvas: HTMLCanvasElement): MapRenderer {
  const probe = document.createElement("canvas");
  if (!probe.getContext("webgl2")) return new Canvas2DMapRenderer(canvas);
  return new WebGLMapRenderer(canvas);
}
