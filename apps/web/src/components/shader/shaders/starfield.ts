// Starfield shader — inspired by Shadertoy "Star Nest" (MtcGDf)
// Simplified volumetric starfield for background

export const starfieldShader = `#version 300 es
precision mediump float;
uniform float iTime;
uniform vec2 iResolution;
out vec4 fragColor;

#define iterations 15
#define formuparam 0.53
#define volsteps 12
#define stepsize 0.1
#define tile 0.85
#define speed 0.003
#define brightness 0.002
#define darkmatter 0.300
#define distfading 0.730
#define saturation 0.850

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy - 0.5;
  uv.y *= iResolution.y / iResolution.x;

  vec3 dir = vec3(uv * 2.0, 1.0);
  float time = iTime * speed + 0.25;

  vec3 from = vec3(1.0, 0.5, 0.5);
  from += vec3(time * 2.0, time, -2.0);

  // volumetric rendering
  float s = 0.1, fade = 1.0;
  vec3 v = vec3(0.0);

  for (int r = 0; r < volsteps; r++) {
    vec3 p = from + s * dir * 0.5;
    p = abs(vec3(tile) - mod(p, vec3(tile * 2.0)));

    float pa, a = pa = 0.0;
    for (int i = 0; i < iterations; i++) {
      p = abs(p) / dot(p, p) - formuparam;
      a += abs(length(p) - pa);
      pa = length(p);
    }

    float dm = max(0.0, darkmatter - a * a * 0.001);
    a *= a * a;

    if (r > 6) fade *= 1.0 - dm;

    v += fade;
    v += vec3(s, s * s, s * s * s * s) * a * brightness * fade;
    fade *= distfading;
    s += stepsize;
  }

  v = mix(vec3(length(v)), v, saturation);

  // Darken overall and add deep blue tint
  v *= 0.008;
  v += vec3(0.01, 0.015, 0.04);

  fragColor = vec4(v, 1.0);
}
`;
