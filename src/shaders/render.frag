uniform highp sampler3D u_map;
uniform highp sampler2D u_noise;

flat in ivec3 v_cellPos;
smooth in vec3 v_fractPos;
flat in vec3 v_color;
flat in vec3 v_normal;
flat in int v_id;

layout(location=0) out vec4 c_diffuse;
layout(location=1) out vec4 c_reflection;

// Quality-adjustable raytracing parameters
int MAX_RAY_STEPS = X * (QUALITY + 1)/3;
int MAX_SUN_STEPS = Z * (QUALITY + 2);

// Utility functions
//-------------------
vec4 noise(vec2 p) {
  return texture(u_noise, p);
}
float white_noise(vec2 p) { return noise(p).r; }
float fractal_noise(vec2 p) { return noise(p).g; }

vec2 rotate2d(vec2 v, float a) {
  float sinA = sin(a);
  float cosA = cos(a);
  return vec2(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);
}

vec3 jitter(vec3 v, float f) {
#ifdef JITTER
  v.xz = rotate2d(v.xz, 0.5 - white_noise(f*(v_fractPos.xy + v_fractPos.z)));
  v.xy = rotate2d(v.xy, 0.5 - white_noise(f*(v_fractPos.xy + v_fractPos.z)));
#endif
  return v;
}

// Read data from texture
//------------------------
ivec3 tex(ivec3 c) {
  return ivec3(texelFetch(u_map, c, 0).rgb * 255.);
}
vec3 tex(ivec3 c, vec3 f) {
  return texture(u_map, (vec3(c) + f)*Sf).rgb * 255.;
}
// SDF texture is split into two directions:
// one for the distance to the closest thing above
// and one for the distance to the closest thing below,
// speeding up raymarching
int sdf_dir(ivec3 c, int dir) {
  ivec2 d = tex(c).rg;
  return (d.r + max(0, c.z - Z))*dir + d.g*(1-dir);
}
// Fancy trilinear interpolator (stolen from Wikipedia)
float sdf(ivec3 c, vec3 f) {
  vec3 d = tex(c, f);
  return min(d.r, d.g);
}

// Raymarcher
//------------

// Output object
struct March {
  ivec3 cellPos; // integer cell position
  vec3 fractPos; // floating point fractional cell position [0, 1)
  vec3 v_normal; // surface v_normal
  float minDist; // minimum distance encountered
  int step; // number of steps taken
  float glass; // amount of glass hit
  int material; // material type
};

// Cube-accelerated code-spaghetti raymarcher
// Based on Xor's [shadertoy.com/view/fstSRH]
// and modified in order to support integer coordinates
March march( ivec3 rayCellPos, vec3 rayFractPos, vec3 rayDir, int MAX_STEPS ) {
  March res;

  // materials encountered (currently: glass or not glass)
  res.material = 0;
  int lastMaterial;

  // store initial ray direction (currently: for exiting glass)
  vec3 iRayDir = rayDir;

  // other initial values
  res.minDist = Zf;
  res.step = 0;
  res.cellPos = rayCellPos;
  res.fractPos = rayFractPos;

  vec3 axisCellDist;
  vec3 axisRayDist; vec3 minAxis; float minAxisDist;
  int dist = 1;

  // is ray up or down, because SDF is split for performance reasons
  int dir = rayDir.z > 0.0 ? 1 : 0;

  // Start marchin'
  while(res.step < MAX_STEPS && dist != 0) {
    // Distances to each axis
    axisCellDist = fract(-res.fractPos * sign(rayDir)) + 1e-4;

    // How quickly the ray would reach each axis
    axisRayDist = axisCellDist / abs(rayDir);

    // Pick the axis where the ray hits first
    minAxis = vec3(lessThanEqual(
	  axisRayDist.xyz, min(
	    axisRayDist.yzx,
	    axisRayDist.zxy
	    )));
    minAxisDist = length(minAxis * axisRayDist);

    // March along that axis
    res.fractPos += rayDir * float(dist) * minAxisDist;
    res.cellPos += ivec3(floor(res.fractPos));
    res.fractPos = fract(res.fractPos);

    // Calculate v_normals
    res.v_normal = -sign(rayDir * minAxis);
    ivec3 c = res.cellPos;
    ivec3 n = ivec3(res.v_normal);

    // Break early if sky
    if(any(greaterThanEqual(c, ivec3(X,Y,Z))) || any(lessThan(c, ivec3(0)))) {
      res.step = MAX_STEPS;
      break;
    }

    dist = sdf_dir(res.cellPos, dir);

    // TODO: improve floating-point distance
    // currently just casted integer distance
    res.minDist = min(float(dist), res.minDist);
    //res.minDist = min(sdf(res.cellPos, res.fractPos-0.5), res.minDist);


    if(dist == 0) {
      res.material = tex(res.cellPos).b;

      // Glass stuff
      if (res.material == 6) { // If glass

	// Go through the glass
	dist++;

	if(lastMaterial != 6) {
	  // Refract ray
	  res.glass += 1.0 - 0.5*abs(dot(rayDir, res.v_normal));
	  res.glass += sqrt(length(res.fractPos - 0.5));
	  rayDir = refract(rayDir, res.v_normal, 0.8);
	}
      }
    } else {
      rayDir = iRayDir;
      res.material = 0;
    }
    lastMaterial = res.material;

    res.step++;
  }

  return res;
}

// Colorizer
//-----------

void main() {
  vec3 sunCol = vec3(1.2, 1.1, 1.0);
  vec3 rayDir = normalize(vec3(v_cellPos-u_cellPos) + (v_fractPos-u_fractPos));

#ifdef SKY
  // Fancy sky!
  vec3 sunDir = jitter(u_sunDir, 1.0);

  // Color of the sky where the Sun is
  float sunFactor = max(0.0, dot(sunDir, rayDir)) - 1.0;
  float glow = exp2(8.0 * sunFactor);
  sunFactor = exp2(800.0 * sunFactor) + 0.25 * glow;

  // Color of the sky where the Sun isn't
  float scatter = 1.0 - sqrt(max(0.0, sunDir.z));
  vec3 spaceCol = mix(vec3(0.1,0.3,0.5),vec3(0.0), scatter);
  vec3 scatterCol = mix(vec3(0.7, 0.9, 1.0),vec3(1.0,0.3,0.0), scatter);
  vec3 atmCol = mix(scatterCol, spaceCol, sqrt(max(0.0, rayDir.z)));
  // Mix where the Sun is and where the Sun isn't
  vec3 skyCol = vec3(1.4, 1.0, 0.5)*sunFactor + atmCol;

  // Make sure values don't overflow (the Sun can be very bright)
  skyCol = clamp(skyCol, vec3(0), vec3(1));
#else
  vec3 skyCol = mix(vec3(0.8, 0.9, 1.0), vec3(0.1, 0.3, 0.6), rayDir.z);
#endif

  bool isSky = v_id == 1;
  if(isSky) {

#ifdef CLOUDS
    vec2 skyPos = rayDir.xy / sqrt(rayDir.z + 0.03);
    skyPos *= 0.2;
    skyPos *= sqrt(length(skyPos));
    skyPos += 1e-5 * vec2(u_cellPos.xy);

    float cloudTime = u_time * 2e-4;
    float cloudA = fractal_noise(1.0*skyPos + vec2(0, -9)*cloudTime);
    float cloudB = fractal_noise(8.0*skyPos*cloudA + vec2(-1, -3)*cloudTime);
    float cloudC = fractal_noise(64.0*skyPos*cloudB + vec2(1, 5)*cloudTime);
    float cloudFactor = cloudA + cloudB/8.0 + cloudC/64.0;
    cloudFactor = clamp(4.0*(cloudFactor - 0.95), 0.0, 1.0);
    vec3 cloudCol = mix(0.8*(1.0-atmCol), sunCol, 0.05*(cloudA - cloudB));
#else
    vec3 cloudCol = vec3(1);
    float cloudFactor = 0.0;
#endif

    float mountainPos = 0.1 * rayDir.x / rayDir.y;
    float mountainHeight = 0.4 + min(rayDir.y, fractal_noise(vec2(mountainPos)));
    mountainHeight /= exp(64.0 * mountainPos * mountainPos) * 4.0;
    if(mountainHeight > rayDir.z) {
      skyCol = mix(skyCol, skyCol*vec3(0.1, 0.2, 0.1), fractal_noise(mountainPos + rayDir.yz) * rayDir.z);
    } else {
      skyCol += cloudCol*cloudFactor;
    }

    c_diffuse.rgb = skyCol;
  } else {

    vec3 baseCol = v_color;

    vec3 v_normalCol = mat3x3(
	0.90, 0.90, 0.95,
	0.95, 0.95, 1.00,
	1.00, 1.00, 1.00
	) * abs(v_normal);
    // Down bad
    if(v_normal.z < 0.0) v_normalCol *= 0.8;

#ifdef SKY
    // Color the shadow the color of the sky
    vec3 shadeCol = mix(scatterCol, spaceCol, rayDir.z*0.5 + 0.5);
#else
    vec3 shadeCol = skyCol * 0.7;
#endif
    // Make shadow more gray
    shadeCol = mix(shadeCol, vec3(0.8), 0.3);

#ifdef AO
    // Do cheap ambient occlusion by interpolating SDFs
    float ambDist = sdf(v_cellPos + ivec3(v_normal), v_fractPos);
    float ambFactor = min(1.0 - sqrt(ambDist), 0.8);
    vec3 ambCol = mix(vec3(1), shadeCol, ambFactor);
#else
    vec3 ambCol = vec3(1);
#endif

    // Check if we're facing towards Sun
    float shadeFactor = sunDir.z < 0. ? 0.0
      : sqrt(max(0.0, dot(v_normal, sunDir)));
#ifdef SHADOWS
    // March to the Sun unless we hit something along the way
    if( shadeFactor > 0.){
      March sun = march(v_cellPos, v_fractPos, sunDir, MAX_SUN_STEPS);
      shadeFactor *= clamp(sun.minDist, 0., 1.);
    }
    // TODO: soft shadows (aaa)
    // How to do: calculate the raymarcher's minDist more accurately
#endif

    // Mix sunlight and shade
    vec3 lightCol = mix(shadeCol, sunCol, shadeFactor);

#ifdef REFRACTIONS
    if(v_color == 7) {
      March refraction = march(v_cellPos, v_fractPos, refract(rayDir, v_normal, 0.8), MAX_RAY_STEPS);
    }
#endif

#ifdef REFLECTIONS
    vec3 reflectDir = jitter(reflect(rayDir, v_normal), 0.1);

    float reflectFactor = exp2(-16.0 * dot(reflectDir, v_normal)) - 0.05;
    if(reflectFactor > 0.0) {
      March reflection = march(v_cellPos, v_fractPos, reflectDir, MAX_RAY_STEPS);
      vec4 p = u_matrix * vec4(vec3(reflection.cellPos) + reflection.fractPos, 2.0);
      p.xy /= p.z + 1e-5;
      float bounds = max(p.x*p.x, p.y*p.y);
      if(bounds < 1.0) {
	c_reflection.rg = 0.5 + 0.5*p.xy;
	c_reflection.b = reflectFactor * (1.0 - bounds);
      }
    }
#endif

    // Multiply everything together
    c_diffuse.rgb = baseCol
      * v_normalCol
      * lightCol
      * ambCol;
  }
}
