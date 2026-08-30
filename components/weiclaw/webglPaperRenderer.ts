import {
  createPageEdgeMesh,
  createPaperMesh,
  createProjectedShadowMesh,
  type PaperMesh,
  type TurnDirection,
} from "./paperGeometry.ts";

export type PaperTextureKey = "left" | "right" | "under" | "turningFront" | "turningBack";

export type PaperTextureSet = Record<PaperTextureKey, HTMLCanvasElement>;

export type PaperRenderFrame = {
  textures: PaperTextureSet;
  direction: TurnDirection | null;
  hoverDirection: TurnDirection | null;
  progress: number;
  hoverLift: number;
  reducedMotion: boolean;
};

export type PaperDrawOperation =
  | { kind: "paper"; side: "left" | "right"; texture: PaperTextureKey }
  | { kind: "shadow" }
  | { kind: "turning"; face: "front" | "back"; texture: "turningFront" | "turningBack" }
  | { kind: "edge" };

type PaperLocations = {
  position: number;
  normal: number;
  uv: number;
  matrix: WebGLUniformLocation | null;
  texture: WebGLUniformLocation | null;
  lightDirection: WebGLUniformLocation | null;
  spineDarkening: WebGLUniformLocation | null;
  settled: WebGLUniformLocation | null;
  backFace: WebGLUniformLocation | null;
};

type SolidLocations = {
  position: number;
  alpha: number;
  matrix: WebGLUniformLocation | null;
  color: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
};

const paperVertexShader = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec2 aUv;
  uniform mat4 uMatrix;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = aUv;
    vNormal = aNormal;
    vWorldPosition = aPosition;
    gl_Position = uMatrix * vec4(aPosition, 1.0);
  }
`;

const paperFragmentShader = `
  precision mediump float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  uniform sampler2D uPageTexture;
  uniform vec3 uLightDirection;
  uniform float uSpineDarkening;
  uniform float uSettled;
  uniform float uBackFace;
  void main() {
    vec3 normal = normalize(vNormal) * (uBackFace > 0.5 ? -1.0 : 1.0);
    float diffuse = 0.72 + max(dot(normal, normalize(uLightDirection)), 0.0) * 0.34;
    float spineShade = 1.0 - uSpineDarkening * exp(-pow(abs(vWorldPosition.x) / 0.19, 2.0));
    float crest = pow(max(dot(normal, normalize(vec3(-0.31, 0.33, 1.0))), 0.0), 8.0) * 0.038;
    float pageDistance = abs(vWorldPosition.x);
    float innerLift = mix(0.052, 0.014, uSettled) * exp(-pow((pageDistance - 0.18) / 0.15, 2.0));
    float middleSettle = mix(0.034, 0.005, uSettled) * exp(-pow((pageDistance - 0.57) / 0.32, 2.0));
    float outerLift = mix(0.022, 0.003, uSettled) * smoothstep(0.78, 1.02, pageDistance);
    float foldLighting = 1.0 + innerLift - middleSettle + outerLift;
    vec2 paperUv = vec2(uBackFace > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    vec4 paper = texture2D(uPageTexture, paperUv);
    float edgeDistance = min(min(paperUv.x, 1.0 - paperUv.x), min(paperUv.y, 1.0 - paperUv.y));
    float edgeShade = mix(0.965, 1.0, smoothstep(0.0, 0.028, edgeDistance));
    gl_FragColor = vec4(paper.rgb * diffuse * spineShade * edgeShade * foldLighting + crest, paper.a);
  }
`;

const solidVertexShader = `
  attribute vec3 aPosition;
  attribute float aAlpha;
  uniform mat4 uMatrix;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha * uOpacity;
    gl_Position = uMatrix * vec4(aPosition, 1.0);
  }
`;

const solidFragmentShader = `
  precision mediump float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function buildPaperDrawPlan({ direction }: Pick<PaperRenderFrame, "direction">): PaperDrawOperation[] {
  const operations: PaperDrawOperation[] = [
    { kind: "paper", side: "left", texture: direction === "previous" ? "under" : "left" },
    { kind: "paper", side: "right", texture: direction === "next" ? "under" : "right" },
  ];
  if (!direction) return operations;
  return operations.concat(
    { kind: "shadow" },
    { kind: "turning", face: "back", texture: "turningBack" },
    { kind: "turning", face: "front", texture: "turningFront" },
    { kind: "edge" },
  );
}

export function getPaperMeshResolution(cssWidth: number) {
  return cssWidth < 720 ? { columns: 24, rows: 10 } : { columns: 40, rows: 16 };
}

function multiplyMatrices(left: Float32Array, right: Float32Array) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      result[column * 4 + row] =
        left[row] * right[column * 4]
        + left[4 + row] * right[column * 4 + 1]
        + left[8 + row] * right[column * 4 + 2]
        + left[12 + row] * right[column * 4 + 3];
    }
  }
  return result;
}

export function createPaperViewProjection(aspect: number) {
  const safeAspect = Math.max(0.2, aspect);
  const near = 0.1;
  const far = 10;
  const fieldOfView = 34 * Math.PI / 180;
  const scale = 1 / Math.tan(fieldOfView / 2);
  const projection = new Float32Array([
    scale / safeAspect, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
  const view = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, -2.28, 1,
  ]);
  return multiplyMatrices(projection, view);
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WeiClaw paper shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unable to compile WeiClaw paper shader";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Unable to create WeiClaw paper program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unable to link WeiClaw paper program";
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(message);
  }
  return { program, vertexShader, fragmentShader };
}

function createBuffer(gl: WebGLRenderingContext) {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Unable to create WeiClaw paper buffer");
  return buffer;
}

export class WeiClawPaperRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly paperProgram: WebGLProgram;
  private readonly solidProgram: WebGLProgram;
  private readonly shaders: WebGLShader[];
  private readonly buffers: WebGLBuffer[];
  private readonly positionBuffer: WebGLBuffer;
  private readonly normalBuffer: WebGLBuffer;
  private readonly uvBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly alphaBuffer: WebGLBuffer;
  private readonly paperLocations: PaperLocations;
  private readonly solidLocations: SolidLocations;
  private readonly textureCache = new Map<HTMLCanvasElement, WebGLTexture>();
  private matrix = createPaperViewProjection(1.58);
  private resolution = { columns: 40, rows: 16 };
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL is unavailable for the WeiClaw paper renderer");
    this.gl = gl;

    const paper = createProgram(gl, paperVertexShader, paperFragmentShader);
    const solid = createProgram(gl, solidVertexShader, solidFragmentShader);
    this.paperProgram = paper.program;
    this.solidProgram = solid.program;
    this.shaders = [paper.vertexShader, paper.fragmentShader, solid.vertexShader, solid.fragmentShader];

    this.positionBuffer = createBuffer(gl);
    this.normalBuffer = createBuffer(gl);
    this.uvBuffer = createBuffer(gl);
    this.indexBuffer = createBuffer(gl);
    this.alphaBuffer = createBuffer(gl);
    this.buffers = [this.positionBuffer, this.normalBuffer, this.uvBuffer, this.indexBuffer, this.alphaBuffer];

    this.paperLocations = {
      position: gl.getAttribLocation(this.paperProgram, "aPosition"),
      normal: gl.getAttribLocation(this.paperProgram, "aNormal"),
      uv: gl.getAttribLocation(this.paperProgram, "aUv"),
      matrix: gl.getUniformLocation(this.paperProgram, "uMatrix"),
      texture: gl.getUniformLocation(this.paperProgram, "uPageTexture"),
      lightDirection: gl.getUniformLocation(this.paperProgram, "uLightDirection"),
      spineDarkening: gl.getUniformLocation(this.paperProgram, "uSpineDarkening"),
      settled: gl.getUniformLocation(this.paperProgram, "uSettled"),
      backFace: gl.getUniformLocation(this.paperProgram, "uBackFace"),
    };
    this.solidLocations = {
      position: gl.getAttribLocation(this.solidProgram, "aPosition"),
      alpha: gl.getAttribLocation(this.solidProgram, "aAlpha"),
      matrix: gl.getUniformLocation(this.solidProgram, "uMatrix"),
      color: gl.getUniformLocation(this.solidProgram, "uColor"),
      opacity: gl.getUniformLocation(this.solidProgram, "uOpacity"),
    };

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio: number) {
    if (this.disposed) return;
    const ratio = Math.min(Math.max(pixelRatio, 1), 2);
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.matrix = createPaperViewProjection(cssHeight > 0 ? cssWidth / cssHeight : 1.58);
    this.resolution = getPaperMeshResolution(cssWidth);
  }

  render(frame: PaperRenderFrame) {
    if (this.disposed) return;
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const turningMesh = frame.direction ? this.createTurningMesh(frame) : null;
    const plan = buildPaperDrawPlan(frame);

    for (const operation of plan) {
      if (operation.kind === "paper") {
        const mesh = this.createSettledMesh(operation.side, frame);
        this.drawPaperSurface(mesh, frame.textures[operation.texture], "settled", frame.direction);
      } else if (operation.kind === "shadow" && turningMesh) {
        this.drawProjectedShadow(turningMesh, frame.progress);
      } else if (operation.kind === "turning" && turningMesh) {
        this.drawPaperSurface(turningMesh, frame.textures[operation.texture], operation.face, frame.direction);
      } else if (operation.kind === "edge" && turningMesh) {
        this.drawPageEdge(turningMesh, frame.progress);
      }
    }
    this.releaseUnusedTextures(frame.textures);
  }

  private createSettledMesh(side: "left" | "right", frame: PaperRenderFrame) {
    const hoverMatches = (side === "right" && frame.hoverDirection === "next")
      || (side === "left" && frame.hoverDirection === "previous");
    return createPaperMesh({
      ...this.resolution,
      width: 1,
      height: 1.28,
      side,
      mode: hoverMatches && frame.hoverLift > 0 ? "turning" : "settled",
      direction: side === "right" ? "next" : "previous",
      progress: 0,
      cornerLift: frame.reducedMotion ? 0 : frame.hoverLift,
    });
  }

  private createTurningMesh(frame: PaperRenderFrame) {
    const direction = frame.direction ?? "next";
    return createPaperMesh({
      ...this.resolution,
      width: 1,
      height: 1.28,
      side: direction === "next" ? "right" : "left",
      mode: "turning",
      direction,
      progress: clamp(frame.progress),
    });
  }

  private getTexture(canvas: HTMLCanvasElement) {
    const cached = this.textureCache.get(canvas);
    if (cached) return cached;
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to create WeiClaw page texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.textureCache.set(canvas, texture);
    return texture;
  }

  private bindFloatAttribute(location: number, buffer: WebGLBuffer, data: Float32Array, size: number) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  private drawPaperSurface(
    mesh: PaperMesh,
    canvas: HTMLCanvasElement,
    face: "settled" | "front" | "back",
    direction: TurnDirection | null,
  ) {
    const gl = this.gl;
    gl.useProgram(this.paperProgram);
    this.bindFloatAttribute(this.paperLocations.position, this.positionBuffer, mesh.positions, 3);
    this.bindFloatAttribute(this.paperLocations.normal, this.normalBuffer, mesh.normals, 3);
    this.bindFloatAttribute(this.paperLocations.uv, this.uvBuffer, mesh.uvs, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(this.paperLocations.matrix, false, this.matrix);
    gl.uniform3f(this.paperLocations.lightDirection, -0.62, 0.22, 1);
    gl.uniform1f(this.paperLocations.spineDarkening, face === "settled" ? 0.035 : 0.125);
    gl.uniform1f(this.paperLocations.settled, face === "settled" ? 1 : 0);
    gl.uniform1f(this.paperLocations.backFace, face === "back" ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.getTexture(canvas));
    gl.uniform1i(this.paperLocations.texture, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    if (face === "settled") {
      gl.disable(gl.CULL_FACE);
    } else {
      gl.enable(gl.CULL_FACE);
      gl.frontFace(direction === "previous" ? gl.CW : gl.CCW);
      gl.cullFace(face === "front" ? gl.BACK : gl.FRONT);
    }
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
  }

  private drawProjectedShadow(mesh: PaperMesh, progress: number) {
    const gl = this.gl;
    const shadow = createProjectedShadowMesh(mesh, { x: -0.22, y: 0.08, z: 1 }, progress);
    gl.useProgram(this.solidProgram);
    this.bindFloatAttribute(this.solidLocations.position, this.positionBuffer, shadow.positions, 3);
    this.bindFloatAttribute(this.solidLocations.alpha, this.alphaBuffer, shadow.alphas, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shadow.indices, gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(this.solidLocations.matrix, false, this.matrix);
    gl.uniform3f(this.solidLocations.color, 0.08, 0.055, 0.035);
    gl.uniform1f(this.solidLocations.opacity, 0.58);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, shadow.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  private drawPageEdge(mesh: PaperMesh, progress: number) {
    const gl = this.gl;
    const edge = createPageEdgeMesh(mesh);
    const alpha = new Float32Array(edge.positions.length / 3).fill(0.5 + Math.sin(Math.PI * progress) * 0.36);
    gl.useProgram(this.solidProgram);
    this.bindFloatAttribute(this.solidLocations.position, this.positionBuffer, edge.positions, 3);
    this.bindFloatAttribute(this.solidLocations.alpha, this.alphaBuffer, alpha, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edge.indices, gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(this.solidLocations.matrix, false, this.matrix);
    gl.uniform3f(this.solidLocations.color, 0.59, 0.55, 0.48);
    gl.uniform1f(this.solidLocations.opacity, 0.9);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.drawElements(gl.LINES, edge.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  private releaseUnusedTextures(textures: PaperTextureSet) {
    const active = new Set(Object.values(textures));
    for (const [canvas, texture] of this.textureCache) {
      if (!active.has(canvas)) {
        this.gl.deleteTexture(texture);
        this.textureCache.delete(canvas);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.textureCache.values()) this.gl.deleteTexture(texture);
    this.textureCache.clear();
    for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
    this.gl.deleteProgram(this.paperProgram);
    this.gl.deleteProgram(this.solidProgram);
    for (const shader of this.shaders) this.gl.deleteShader(shader);
  }
}
