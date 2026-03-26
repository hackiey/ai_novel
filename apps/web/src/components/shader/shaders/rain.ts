// Rain on glass shader — adapted from Shadertoy "Heartfelt" (ltffzl) by BigWings
// Uses iChannel0 texture for background; no lightning, no zoom

export const rainShader = `#version 300 es
precision mediump float;
uniform float iTime;
uniform vec2 iResolution;
uniform sampler2D iChannel0;
out vec4 fragColor;

#define S(a,b,t) smoothstep(a,b,t)

vec3 N13(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

vec4 N14(float t) {
  return fract(sin(t * vec4(123.0, 1024.0, 1456.0, 264.0)) * vec4(6547.0, 345.0, 8799.0, 1564.0));
}

float N(float t) {
  return fract(sin(t * 12345.564) * 7658.76);
}

float Saw(float b, float t) {
  return S(0.0, b, t) * S(1.0, b, t);
}

vec2 DropLayer2(vec2 uv, float t) {
  vec2 UV = uv;
  uv.y += t * 0.75;
  vec2 a = vec2(6.0, 1.0);
  vec2 grid = a * 2.0;
  vec2 id = floor(uv * grid);

  float colShift = N(id.x);
  uv.y += colShift;

  id = floor(uv * grid);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);

  float x = n.x - 0.5;
  float y = UV.y * 20.0;
  float wiggle = sin(y + sin(y));
  x += wiggle * (0.5 - abs(x)) * (n.z - 0.5);
  x *= 0.7;
  float ti = fract(t + n.z);
  y = (Saw(0.85, ti) - 0.5) * 0.9 + 0.5;
  vec2 p = vec2(x, y);

  float d = length((st - p) * a.yx);
  float mainDrop = S(0.4, 0.0, d);

  float r = sqrt(S(1.0, y, st.y));
  float cd = abs(st.x - x);
  float trail = S(0.23 * r, 0.15 * r * r, cd);
  float trailFront = S(-0.02, 0.02, st.y - y);
  trail *= trailFront * r * r;

  y = UV.y;
  float trail2 = S(0.2 * r, 0.0, cd);
  float droplets = max(0.0, (sin(y * (1.0 - y) * 120.0) - st.y)) * trail2 * trailFront * n.z;
  y = fract(y * 10.0) + (st.y - 0.5);
  float dd = length(st - vec2(x, y));
  droplets = S(0.3, 0.0, dd);
  float m = mainDrop + droplets * r * trailFront;

  return vec2(m, trail);
}

float StaticDrops(vec2 uv, float t) {
  uv *= 40.0;
  vec2 id = floor(uv);
  uv = fract(uv) - 0.5;
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.7;
  float d = length(uv - p);
  float fade = Saw(0.025, fract(t + n.z));
  float c = S(0.3, 0.0, d) * fract(n.z * 10.0) * fade;
  return c;
}

vec2 Drops(vec2 uv, float t, float l0, float l1, float l2) {
  float s = StaticDrops(uv, t) * l0;
  vec2 m1 = DropLayer2(uv, t) * l1;
  vec2 m2 = DropLayer2(uv * 1.85, t) * l2;
  float c = s + m1.x + m2.x;
  c = S(0.3, 1.0, c);
  return vec2(c, max(m1.y * l0, m2.y * l1));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
  vec2 UV = gl_FragCoord.xy / iResolution.xy;
  float T = iTime;
  float t = T * 0.2;

  float rainAmount = 0.3;
  float maxBlur = mix(3.0, 6.0, rainAmount);
  float minBlur = 2.0;

  float staticDrops = S(-0.5, 1.0, rainAmount) * 2.0;
  float layer1 = S(0.25, 0.75, rainAmount);
  float layer2 = S(0.0, 0.5, rainAmount);

  vec2 c = Drops(uv, t, staticDrops, layer1, layer2);

  vec2 e = vec2(0.001, 0.0);
  float cx = Drops(uv + e, t, staticDrops, layer1, layer2).x;
  float cy = Drops(uv + e.yx, t, staticDrops, layer1, layer2).x;
  vec2 n = vec2(cx - c.x, cy - c.x);

  float focus = mix(maxBlur - c.y, minBlur, S(0.1, 0.2, c.x));

  vec3 col = textureLod(iChannel0, UV + n, focus).rgb;

  // Darken background so it doesn't interfere with editor text
  col *= 0.45;

  // Subtle color grade — push towards cool blue
  col *= mix(vec3(1.0), vec3(0.7, 0.8, 1.2), 0.4);

  // Vignette
  vec2 v = UV - 0.5;
  col *= 1.0 - dot(v, v) * 0.8;

  fragColor = vec4(col, 1.0);
}
`;
