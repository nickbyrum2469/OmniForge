const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

export function srgbChannelToLinear(value) {
  const channel = clamp01(value);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(value) {
  const channel = Math.max(0, Number(value) || 0);
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export function srgbToLinear(color = []) {
  return [0, 1, 2].map(index => srgbChannelToLinear(color[index]));
}

export function linearToSrgb(color = []) {
  return [0, 1, 2].map(index => linearChannelToSrgb(color[index]));
}

export const SRGB_GLSL = `
vec3 srgbToLinear(vec3 value){
  vec3 low=value/12.92;
  vec3 high=pow((value+0.055)/1.055,vec3(2.4));
  return mix(high,low,lessThanEqual(value,vec3(0.04045)));
}
vec3 linearToSrgb(vec3 value){
  value=max(value,vec3(0.0));
  vec3 low=value*12.92;
  vec3 high=1.055*pow(value,vec3(1.0/2.4))-0.055;
  return mix(high,low,lessThanEqual(value,vec3(0.0031308)));
}`;
