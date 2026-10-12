import { mul } from '../geo/mat';
import type { Mat3 } from '../geo/mat';
import type { Kamera } from '../geo/verzeichnung';

/**
 * Zeichnet das Foto über WebGL2: Für jeden Bildschirmpixel rechnet der Shader über eine 3×3-Matrix auf den
 * idealen Fotopunkt zurück, verzeichnet ihn wie das Objektiv und liest dort das Foto (mit Mipmaps, damit
 * verkleinerte Bereiche nicht flimmern). Dieselbe Abbildung dient für die Fotoansicht, die entzerrte
 * Ansicht, die Lupe und den Export (gekachelt in einen Framebuffer).
 */

const VS = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D foto;
uniform mat3 m;          // gl_FragCoord → idealer Fotopunkt (px), homogen
uniform vec2 groesse;    // Fotogröße in px
uniform vec4 linse;      // cx, cy, 1/R², k1
uniform float k2;
uniform vec4 leer;       // Farbe außerhalb des Fotos
out vec4 farbe;
void main() {
  vec3 h = m * vec3(gl_FragCoord.xy, 1.0);
  if (h.z <= 0.0) { farbe = leer; return; }
  vec2 u = h.xy / h.z;
  vec2 d = u - linse.xy;
  float r2 = dot(d, d) * linse.z;
  vec2 p = linse.xy + d * (1.0 + linse.w * r2 + k2 * r2 * r2);
  vec2 t = p / groesse;
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) { farbe = leer; return; }
  farbe = texture(foto, t);
}`;

export interface Zeichnen {
  /** Bildschirm (CSS-px, y nach unten, bezogen auf den Zeichenbereich) → idealer Fotopunkt */
  m: Mat3;
  kamera: Kamera;
  /** Zeichenbereich in Gerätepixeln, von oben links */
  x: number;
  y: number;
  breite: number;
  hoehe: number;
  /** Gerätepixel je CSS-Pixel */
  dpr: number;
  leer?: [number, number, number, number];
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture | null = null;
  private fotoGroesse: [number, number] = [1, 1];
  private uni: Record<string, WebGLUniformLocation | null> = {};
  readonly maxTextur: number;

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: false, antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 wird von diesem Browser nicht unterstützt.');
    this.gl = gl;
    this.maxTextur = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const shader = (typ: number, src: string) => {
      const s = gl.createShader(typ)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Shader: ${gl.getProgramInfoLog(p)}`);
    this.prog = p;
    for (const n of ['foto', 'm', 'groesse', 'linse', 'k2', 'leer']) this.uni[n] = gl.getUniformLocation(p, n);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  /** Lädt das Foto als Textur. Größere Fotos als die Grafikkarte erlaubt werden verkleinert. */
  async setzeFoto(bild: ImageBitmap, breite: number, hoehe: number) {
    const gl = this.gl;
    let quelle: ImageBitmap = bild;
    if (bild.width > this.maxTextur || bild.height > this.maxTextur) {
      const f = this.maxTextur / Math.max(bild.width, bild.height);
      quelle = await createImageBitmap(bild, { resizeWidth: Math.floor(bild.width * f), resizeHeight: Math.floor(bild.height * f), resizeQuality: 'high' });
    }
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, quelle);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number));
    if (quelle !== bild) quelle.close();
    this.fotoGroesse = [breite, hoehe];
  }

  get hatFoto() {
    return this.tex !== null;
  }

  leeren(hoehe: number) {
    const gl = this.gl;
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, gl.drawingBufferWidth, hoehe);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Zeichnet in den Bereich (x, y, breite, hoehe) des aktuellen Ziels (Gerätepixel, y von oben).
   * `zielHoehe`: Höhe des Ziels in Gerätepixeln (für die Umrechnung von gl_FragCoord, y von unten).
   */
  zeichnen(z: Zeichnen, zielHoehe: number) {
    const gl = this.gl;
    if (!this.tex) return;
    const glY = zielHoehe - z.y - z.hoehe;
    gl.enable(gl.SCISSOR_TEST);
    gl.viewport(z.x, glY, z.breite, z.hoehe);
    gl.scissor(z.x, glY, z.breite, z.hoehe);
    // gl_FragCoord (Gerätepixel, y von unten, Mitte bei +0,5) → CSS-px im Zeichenbereich, y von oben
    const s = 1 / z.dpr;
    const fragZuCss: Mat3 = [s, 0, -z.x * s, 0, -s, (zielHoehe - z.y) * s, 0, 0, 1];
    const m = mul(z.m, fragZuCss);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uni.foto, 0);
    // GLSL-Matrizen sind spaltenweise
    gl.uniformMatrix3fv(this.uni.m, true, new Float32Array(m));
    gl.uniform2f(this.uni.groesse, this.fotoGroesse[0], this.fotoGroesse[1]);
    gl.uniform4f(this.uni.linse, z.kamera.cx, z.kamera.cy, 1 / (z.kamera.r * z.kamera.r), z.kamera.k1);
    gl.uniform1f(this.uni.k2, z.kamera.k2);
    gl.uniform4fv(this.uni.leer, z.leer ?? [0, 0, 0, 0]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
  }

  /**
   * Rendert ein Bild von `breite × hoehe` px, bei dem Pixel (i, j) (Mitte bei +0,5) über `m` auf den
   * idealen Fotopunkt abgebildet wird. Gekachelt über einen Framebuffer; Ergebnis RGBA, y von oben.
   */
  rendereBild(m: Mat3, kamera: Kamera, breite: number, hoehe: number, leer: [number, number, number, number]): ImageData {
    const gl = this.gl;
    const kachel = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
    const fb = gl.createFramebuffer();
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, kachel, kachel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    const out = new ImageData(breite, hoehe);
    const puffer = new Uint8Array(kachel * kachel * 4);
    try {
      for (let ty = 0; ty < hoehe; ty += kachel) {
        for (let tx = 0; tx < breite; tx += kachel) {
          const w = Math.min(kachel, breite - tx);
          const h = Math.min(kachel, hoehe - ty);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          // Kachel als Zeichenbereich (0, 0, w, h) mit dpr 1; Ausgabepixel = Kachelpixel + Versatz
          const versatz: Mat3 = [1, 0, tx, 0, 1, ty, 0, 0, 1];
          this.zeichnen({ m: mul(m, versatz), kamera, x: 0, y: kachel - h, breite: w, hoehe: h, dpr: 1, leer }, kachel);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, puffer);
          // readPixels liefert von unten nach oben
          for (let r = 0; r < h; r++) {
            const quelle = puffer.subarray((h - 1 - r) * w * 4, (h - r) * w * 4);
            out.data.set(quelle, ((ty + r) * breite + tx) * 4);
          }
        }
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteRenderbuffer(rb);
    }
    return out;
  }

  /** Gibt die Textur frei; `kontextAufgeben` nur für Canvas, die danach nicht mehr gebraucht werden (Export) */
  freigeben(kontextAufgeben = false) {
    if (this.tex) this.gl.deleteTexture(this.tex);
    this.tex = null;
    if (kontextAufgeben) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

