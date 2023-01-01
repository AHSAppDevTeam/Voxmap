uniform highp sampler2D u_noise;
uniform highp sampler3D u_map;

flat in ivec3 v_cellPos;
smooth in vec3 v_fractPos;
flat in vec3 v_color;
flat in vec3 v_normal;
flat in int v_id;

layout(location=0) out vec4 c_diffuse;
layout(location=1) out vec4 c_reflection;

const int MAX_STEPS = X;

// Utility functions
//-------------------
vec4 noise(vec2 p) {
  return 1.0 - 2.0 * texture(u_noise, p);
}

// white noise
vec3 white(vec2 p) { return noise(p).rgb; }

// fractal brownian motion noise
float fbm(vec2 p) { return noise(p).a; }

vec2 rotate2d(vec2 v, vec2 a) {
  return vec2(v.x*a.x - v.y*a.y, v.y*a.x + v.x*a.y);
}
vec2 rotate2d(vec2 v, float a) {
  float sinA = sin(a);
  float cosA = cos(a);
  return vec2(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);
}

vec3 jitter(vec3 v, float f) {
  vec3 w = f*white(0.1*(v_fractPos.xy + v_fractPos.z));
  vec3 mask = 1.0 - abs(v_normal);
  return normalize((v + w)*mask + v_normal);
}

// Read data from texture
//------------------------
vec3 tex(ivec3 c) {
  return texelFetch(u_map, c, 0).rgb * 255.;
}
vec3 tex(ivec3 c, vec3 f) {
  return texture(u_map, (vec3(c) + f)*Sf).rgb * 255.;
}
// SDF texture is split into two directions:
// one for the distance to the closest thing above
// and one for the distance to the closest thing below,
// speeding up raymarching
float sdf_dir(ivec3 c, float dir) {
  vec2 d = tex(c).rg;
  return mix(d.r, d.g, 1.0-dir);
}
float sdf_dir(ivec3 c, vec3 f, float dir) {
  vec2 d = tex(c, f).rg;
  return mix(d.r, d.g, 1.0-dir);
}
float sdf(ivec3 c, vec3 f) {
  vec2 d = tex(c, f).rg;
  return min(d.r, d.g);
}

// Raymarcher
//------------

// Output object
struct March {
  ivec3 cellPos; // integer cell position
  vec3 fractPos; // floating point fractional cell position [0, 1)
  vec3 normal;
  float minDist;
  int step; // number of steps taken
};

// Cube-accelerated code-spaghetti raymarcher
// Based on Xor's [shadertoy.com/view/fstSRH]
// and modified in order to support integer coordinates
March march( ivec3 rayCellPos, vec3 rayFractPos, vec3 rayDir ) {
  March res;

  // other initial values
  res.step = 0;
  res.cellPos = rayCellPos;
  res.fractPos = rayFractPos;
  res.minDist = Zf;

  vec3 axisCellDist;
  vec3 axisRayTime; vec3 minAxisDir; float minAxisDist;
  float safeSteps = 1.0;

  // is ray up or down, because SDF is split for performance reasons
  float dir = rayDir.z > 0.0 ? 1.0 : 0.0;

  // Start marchin'
  while(res.step < MAX_STEPS && safeSteps != 0.0) {
    // Distances to each axis
    axisCellDist = fract(-res.fractPos * sign(rayDir)) + 1e-4;

    // How quickly the ray would reach each axis
    axisRayTime = axisCellDist / abs(rayDir);

    // Pick the axis where the ray hits first
    minAxisDir = vec3(lessThanEqual(
	  axisRayTime.xyz, min(
	  axisRayTime.yzx,
	  axisRayTime.zxy
    )));
    minAxisDist = length(minAxisDir * axisRayTime);
    /*
    vec3 maxAxisDir = vec3(greaterThanEqual(
	  axisRayTime.xyz, max(
	  axisRayTime.yzx,
	  axisRayTime.zxy
    )));
    vec3 midAxisDir = vec3(1) - minAxisDir - maxAxisDir;
    float maxAxisDist = length(maxAxisDir * axisRayTime);
    float midAxisDist = length(midAxisDir * axisRayTime);
    */

    // March along that axis
    res.fractPos += rayDir * safeSteps * minAxisDist;
    res.cellPos += ivec3(floor(res.fractPos));
    res.fractPos = fract(res.fractPos);

    // Break early if sky
    if(any(greaterThanEqual(res.cellPos, ivec3(X,Y,Z))) || any(lessThan(res.cellPos, ivec3(0)))) {
      res.step = MAX_STEPS;
      break;
    }

    safeSteps = sdf_dir(res.cellPos, dir);
    /*
    if(minAxisDist > 0.001 && safeSteps == 1.0) res.minDist = min(
	(minAxisDist*length(vec2(midAxisDist, maxAxisDist)))/length(vec3(minAxisDist, midAxisDist, maxAxisDist)), res.minDist);
    //res.minDist = min(safeSteps-1.0, res.minDist);
    */

    res.step++;
  }

  // Calculate normals
  res.normal = -sign(rayDir * minAxisDir);

  return res;
}

// Colorizer
//-----------

void main() {
  c_diffuse = vec4(0,0,0,1);
  c_reflection = vec4(0,0,0,1);

  bool isSky = v_id == 1;
  bool isGlass = v_id == 2;

  const vec3 litCol = vec3(0.4, 0.35, 0.3);
  vec3 rayDir = normalize(vec3(v_cellPos-u_cellPos) + (v_fractPos-u_fractPos));
  vec3 reflectDir = reflect(rayDir, v_normal);
  if(u_quality > 2) { // add roughness to reflection surface
    reflectDir = reflect(rayDir, jitter(v_normal, 0.5));
  }

  vec3 sunDir = u_sunDir; //jitter(u_sunDir, 0.5);

  // Fancy sky!

  // Color of the sky where the Sun is
  const vec3 sunCol = vec3(1.4, 1.0, 0.5);
  float sunFactor = max(0.0, dot(u_sunDir, reflectDir)) - 1.0;
  float glow = exp2(8.0 * sunFactor);
  sunFactor = exp2(4000.0 * sunFactor) + 0.3 * glow;

  // Color of the sky where the Sun isn't
  float scatter = 1.0 - sqrt(max(0.0, sunDir.z));
  vec3 spaceCol = mix(vec3(0.2,0.4,0.7),vec3(0.2,0.3,0.5), scatter);
  vec3 scatterCol = mix(vec3(0.7, 0.9, 1.0),vec3(1.0,0.3,0.2), scatter);
  vec3 atmCol = mix(scatterCol, spaceCol, sqrt(max(0.0, reflectDir.z)));
  // Mix where the Sun is and where the Sun isn't
  vec3 skyCol = sunCol*sunFactor + atmCol;

  // Make sure values don't overflow (the Sun can be very bright)
  skyCol = clamp(skyCol, vec3(0), vec3(1));

  if(isSky) {

    vec3 cloudCol = vec3(1);
    float cloudFactor = 0.0;
    if(u_quality > 1) { // Clouds
      float cloudTime = u_time * 4e-3;
      vec2 skyPos = rayDir.xy / sqrt(rayDir.z + 0.03);
      skyPos *= 0.1;
      skyPos *= sqrt(length(skyPos));
      skyPos *= 3.0 + vec2(
	  fbm(2.0*skyPos + cloudTime),
	  fbm(2.0*skyPos - cloudTime)
	);
      skyPos += 1e-4 * (vec2(u_cellPos.xy) + u_fractPos.xy); 
      cloudFactor = exp2(6.0 * (fbm(skyPos + vec2(2, -9)*cloudTime) - 1.0));
      cloudCol = mix(sunCol, vec3(0.8), sqrt(cloudFactor));
    }

    float mountainPos = rayDir.x / rayDir.y;
    float mountainHeight = 1.0 - fbm(vec2(0.3 * mountainPos));
    float mountainFactor = 2.0 - fbm(2.0*(mountainPos + rayDir.yz));
    mountainHeight /= exp(0.3 * mountainPos * mountainPos) * 6.0;
    if(mountainHeight > rayDir.z && rayDir.y > 0.0 && rayDir.z > 0.0) {
      skyCol = mix(skyCol, skyCol*vec3(0.7, 0.8, 0.7), mountainFactor * rayDir.z);
    } else {
      skyCol = mix(skyCol, cloudCol, cloudFactor);
    }

    if(rayDir.z < 0.) skyCol *= 0.5;

    c_diffuse.rgb = skyCol;

  } else { // Determine color of block

    vec3 baseCol = v_color;

    vec3 normalCol = mat3x3(
	0.90, 0.90, 0.95,
	0.95, 0.95, 1.00,
	1.00, 1.00, 1.00
	) * abs(v_normal);
    // Down bad
    if(v_normal.z < 0.0) normalCol *= 0.8;

    // Color the shadow the color of the sky, plus some gray
    vec3 shadeCol = 0.7 * scatterCol;

    // Do cheap ambient occlusion by interpolating SDFs
    float ambDist = sdf(v_cellPos + ivec3(v_normal), v_fractPos);
    float ambFactor = min(1.0 - sqrt(ambDist), 0.8);
    vec3 ambCol = mix(vec3(1), shadeCol, ambFactor);

    // Check if we're facing towards Sun
    float shadeFactor = u_sunDir.z < 0. ? 0.0
      : sqrt(max(0.0, dot(v_normal, u_sunDir)));

    // March to the Sun unless we hit something along the way
    if( shadeFactor > 0.){
#ifdef SOFT
      float md = Zf;
      float i = 0.1;
      float dd = 0.1;
      while(i < Zf) {
	float d = sdf_dir(v_cellPos, v_fractPos + i*sunDir, 1.0) - 0.5;
	md = min(d, md);
	i += max(dd, d);
      }
      shadeFactor *= smoothstep(0.0, 1.0, md*Zf*4.0/(i-0.1));
#else
      March sun = march(v_cellPos, v_fractPos, sunDir);
      /*
      c_diffuse.rgb = vec3(sun.minDist);
      return;
      */
      shadeFactor *= float(sun.step == MAX_STEPS);
#endif
    }
    /*
      c_diffuse.rgb = vec3(sdf(v_cellPos, v_fractPos - 0.5*v_normal - rayDir));
      return;
      */

    // Mix sunlight and shade
    vec3 lightCol = shadeCol + litCol*shadeFactor;

#ifdef REFRACTIONS
    if(v_color == 7) {
      March refraction = march(v_cellPos, v_fractPos, refract(rayDir, v_normal, 0.8));
    }
#endif

    if(u_quality > 2) { // Reflections
      float reflectFactor = 0.5 * exp2(8.0 * dot(rayDir, v_normal)) - 0.05;
      if(reflectFactor > 0.0) {
	March reflection = march(v_cellPos, v_fractPos, reflectDir);
	vec4 p = u_matrix * vec4(vec3(reflection.cellPos) + reflection.fractPos, 1.0);
	p.xy /= p.w;
	float bounds = max(p.x*p.x, p.y*p.y);
	if(bounds < 1.0) {
	  c_reflection.rg = 0.5 + 0.5*p.xy;
	  c_reflection.b = reflectFactor * (1.0 - bounds);
	}
      }
    }

    // Multiply everything together
    c_diffuse.rgb = baseCol;
    if(u_quality > 0) {
      c_diffuse.rgb *= normalCol * lightCol * ambCol;
    }

    if(isGlass) {
      c_diffuse.a = 0.8 * exp2(dot(rayDir, v_normal));
      c_diffuse.rgb *= 0.2 * atmCol;
    }

  }
}
