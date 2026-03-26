import { useEffect, useRef, useCallback } from "react";
import type { WriteTheme } from "../../contexts/WriteThemeContext.js";
import { rainShader } from "./shaders/rain.js";
import { starfieldShader } from "./shaders/starfield.js";

const VERTEX_SHADER = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

function getFragmentSource(theme: WriteTheme): string {
  if (theme === "rain") return rainShader;
  return starfieldShader;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function loadTexture(gl: WebGL2RenderingContext, url: string): Promise<WebGLTexture | null> {
  return new Promise((resolve) => {
    const tex = gl.createTexture();
    if (!tex) { resolve(null); return; }

    // Placeholder 1x1 pixel while image loads
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      resolve(tex);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

interface ShaderCanvasProps {
  theme: WriteTheme;
  pixelRatio?: number;
}

export default function ShaderCanvas({ theme, pixelRatio = 0.5 }: ShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const startTimeRef = useRef(performance.now());
  const uniformsRef = useRef<{
    iTime: WebGLUniformLocation | null;
    iResolution: WebGLUniformLocation | null;
    iChannel0: WebGLUniformLocation | null;
  }>({ iTime: null, iResolution: null, iChannel0: null });

  const needsTexture = theme === "rain";
  const fragSource: string = getFragmentSource(theme);

  const initGL = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!gl) return false;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
    if (!vs || !fs) return false;

    const program = gl.createProgram();
    if (!program) return false;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("Program link error:", gl.getProgramInfoLog(program));
      return false;
    }

    // Full-screen quad
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);

    uniformsRef.current = {
      iTime: gl.getUniformLocation(program, "iTime"),
      iResolution: gl.getUniformLocation(program, "iResolution"),
      iChannel0: gl.getUniformLocation(program, "iChannel0"),
    };

    // Load texture for rain shader
    if (needsTexture) {
      const tex = await loadTexture(gl, "/iChannel0.png");
      textureRef.current = tex;
      if (tex && uniformsRef.current.iChannel0) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(uniformsRef.current.iChannel0, 0);
      }
    }

    glRef.current = gl;
    programRef.current = program;
    startTimeRef.current = performance.now();
    return true;
  }, [fragSource, needsTexture]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = pixelRatio;
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, [pixelRatio]);

  useEffect(() => {
    resize();

    let cancelled = false;

    initGL().then((ok) => {
      if (!ok || cancelled) return;

      const gl = glRef.current!;

      const render = () => {
        if (cancelled) return;
        if (document.hidden) {
          rafRef.current = requestAnimationFrame(render);
          return;
        }
        resize();
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const t = (performance.now() - startTimeRef.current) / 1000;
        if (uniformsRef.current.iTime) gl.uniform1f(uniformsRef.current.iTime, t);
        if (uniformsRef.current.iResolution) gl.uniform2f(uniformsRef.current.iResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);

        // Ensure texture is bound each frame
        if (textureRef.current) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        rafRef.current = requestAnimationFrame(render);
      };

      rafRef.current = requestAnimationFrame(render);
    });

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      if (textureRef.current && glRef.current) {
        glRef.current.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      if (programRef.current && glRef.current) {
        glRef.current.deleteProgram(programRef.current);
      }
      glRef.current = null;
      programRef.current = null;
    };
  }, [initGL, resize]);

  return (
    <>
      {/* CSS gradient fallback — behind canvas, visible if WebGL fails */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: -1,
          background: theme === "rain"
            ? "linear-gradient(180deg, #0a0c12 0%, #141828 100%)"
            : "linear-gradient(180deg, #050510 0%, #0a0a20 100%)",
        }}
        aria-hidden
      />
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />
    </>
  );
}
