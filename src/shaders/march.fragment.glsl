#version 330 core
precision highp float;
precision lowp int;

/* Quality settings:
   +---+---------+-------------------+-------------+-----------------+
   |   | Shadows | Ambient Occlusion | Reflections | Render distance |
   +---+---------+-------------------+-------------+-----------------+
   | 0 | No      | No                | No          | Short           |
   +---+---------+-------------------+-------------+-----------------+
   | 1 | Yes     | No                | No          | Medium          |
   +---+---------+-------------------+-------------+-----------------+
   | 2 | Yes     | Yes               | No          | Medium          |
   +---+---------+-------------------+-------------+-----------------+
   | 3 | Yes     | Yes               | Yes         | Long            |
   +---+---------+-------------------+-------------+-----------------+*/
#define QUALITY 3

#if QUALITY > 0
#define SHADOWS
#define SKY
#endif

#if QUALITY > 1
#define AO
#endif

#if QUALITY > 2
#endif

#if QUALITY > 3
#define JITTER
#endif

out vec4 FragColor;

uniform highp sampler2D mapTexture;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 iCamRot;

uniform ivec3 iCamCellPos;
uniform vec3 iCamFractPos;

uniform vec3 iSunDir;

uniform int iFrame;

// Dimensions
const int X = 1024;
const int Y = 256;
const int Z = 16;

const float Xf = float(X);
const float Yf = float(Y);
const float Zf = float(Z);

const vec2 Mf = vec2(Xf, Yf * Zf);

const float FoV = 1.0;

// Quality-adjustable raytracing parameters
const int MAX_BOUNCES = max(QUALITY - 1, 1);
int MAX_RAY_STEPS = X * (QUALITY + 1)/3;
int MAX_SUN_STEPS = Z * (QUALITY + 2);

// Utility functions
//-------------------

// Collection of noises
// shift 0: multi-octave fractal noise
// shift 1: white noise
vec3 noise(vec2 p, int shift, float t) {
  t *= 1e-3;
  vec2 y = vec2(0, float(shift) * Xf / Mf);
#define OFFSET(P) ((fract(P) + 1.0/Xf)/(1.0 + 2.0/Xf)*Xf/Mf + y)
  return vec3(
    texture(mapTexture, OFFSET(p + t*vec2(0,-9))).a,
    texture(mapTexture, OFFSET(p*2.0 + 0.1 + t*vec2(-1,-3))).a,
    texture(mapTexture, OFFSET(p*4.0 + 0.4 + t*vec2( 1, 5))).a
  );
}
vec3 noise(vec2 p, int shift) {
  return noise(p, shift, 0.0);
}

// Vector rotater
vec2 rotate2d(vec2 v, float a) {
  float sinA = sin(a);
  float cosA = cos(a);
  return vec2(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);
}

// Read data from texture
//------------------------

ivec2 project(ivec3 c){
  c.x = clamp(c.x, 0, X-1);
  c.y = clamp(c.y, 0, Y-1);
  c.z = clamp(c.z, 0, Z-1);
  return ivec2(c.x, c.y + Y*c.z);
}
// Read 2D texture from 3D coordinate
ivec3 tex(ivec3 c) {
  return ivec3(texelFetch(mapTexture, project(c), 0).rgb * 255.);
}
vec3 tex(ivec3 c, vec3 f) {
  f = f - 0.5;
  vec2 p = vec2(project(c)) + f.xy;
  vec2 shift = vec2(0, sign(f.z)) * Yf;
  f = abs(f);
  return 255.0 * mix(
      texture(mapTexture, (p)/Mf),
      texture(mapTexture, (p + shift)/Mf),
      f.z
    ).rgb;
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

// Get color from texture's palette index
vec3 palette(int p) {
  return p==0?vec3(0,0,0):p==1?vec3(0.0431373,0.0627451,0.0745098):p==2?vec3(0.133333,0.490196,0.317647):p==3?vec3(0.180392,0.662745,0.87451):p==4?vec3(0.337255,0.423529,0.45098):p==5?vec3(0.392157,0.211765,0.235294):p==6?vec3(0.439216,0.486275,0.454902):p==7?vec3(0.505882,0.780392,0.831373):p==8?vec3(0.52549,0.65098,0.592157):p==9?vec3(0.666667,0.666667,0.666667):p==10?vec3(0.741176,0.752941,0.729412):p==11?vec3(0.768627,0.384314,0.262745):p==12?vec3(0.780392,0.243137,0.227451):p==13?vec3(0.854902,0.788235,0.65098):p==14?vec3(0.964706,0.772549,0.333333):p==15?vec3(0.984314,0.886275,0.317647):p==16?vec3(1,1,1):vec3(1);
}

// Raymarcher
//------------

// Output object
struct March {
  ivec3 cellPos; // integer cell position
  vec3 fractPos; // floating point fractional cell position [0, 1)
  vec3 rayPos; // total cell position
  vec3 normal; // surface normal
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

    // Calculate normals
    res.normal = -sign(rayDir * minAxis);
    ivec3 c = res.cellPos;
    ivec3 n = ivec3(res.normal);

    // Break early if sky
    if(any(greaterThan(c, ivec3(X,Y,Z))) || any(lessThan(c, ivec3(0)))) {
      res.step = MAX_STEPS;
      break;
    }

    dist = sdf_dir(res.cellPos, dir);

    // TODO: improve floating-point distance
    // currently just casted integer distance
    res.minDist = min(float(dist), res.minDist);

    if(dist == 0) {
      res.material = tex(res.cellPos).b;

      // Glass stuff
      if (res.material == 7) { // If glass

	// Go through the glass
	dist++;

	if(lastMaterial != 7) {
	  // Refract ray
	  res.glass += 1.0 - 0.5*abs(dot(rayDir, res.normal));
	  res.glass += sqrt(length(res.fractPos - 0.5));
	  rayDir = refract(rayDir, res.normal, 0.8);
	}
      }
    } else {
      rayDir = iRayDir;
      res.material = 0;
    }
    lastMaterial = res.material;

    res.step++;
  }
  res.rayPos = vec3(res.cellPos) + res.fractPos;

  return res;
}

// Colorizer
//-----------

void main() {

  // Set opacity to 1
  FragColor.a = 1.0;

  // Marching setup
  ivec3 camCellPos = iCamCellPos;
  vec3 camFractPos = iCamFractPos;
  vec3 rayDir;

  vec2 screenPos = (2.0 * gl_FragCoord.xy - iResolution.xy) * FoV / length(iResolution.xy);

#ifdef JITTER
  vec3 jitter = 1.0 + 0.1 * noise(gl_FragCoord.xy, 1);
#else
  vec3 jitter = vec3(1.0);
#endif

  // First-person rectilinear perspective camera
  rayDir = normalize(vec3(screenPos.x, 1.0, screenPos.y));
  rayDir.yz = rotate2d(rayDir.yz, iCamRot.x);
  rayDir.xy = rotate2d(rayDir.xy, iCamRot.z);

  // Set up the Sun
  vec3 sunDir = iSunDir;

  // Shorthand for FragColor.rgb
  vec3 col;
  float bounceFactor = 1.0;

  // Start marchin'!
  for(int i = 0; i < MAX_BOUNCES; i++) {

    // Get result of marching
    March res = march(camCellPos, camFractPos, rayDir, MAX_RAY_STEPS);

    // Intersection distance
    float dist = length(res.rayPos.xy - vec2(camCellPos.xy));

    // Start coloring!

    // Get base color (matte & shadowless) from texture
    vec3 baseCol = palette(res.material);

    // Mix in any glass we hit along the way
    vec3 glassCol = mix(vec3(0.3, 0.5, 0.7), vec3(1), exp2(-1.5 * res.glass));

    // Darken faces with ±X, ±Y, or -Z normals
    vec3 normalCol = mat3x3(
	0.90, 0.90, 0.95,
	0.95, 0.95, 1.00,
	1.00, 1.00, 1.00
	) * abs(res.normal);

    if(res.normal.z < 0.) normalCol *= 0.8;
    // Illumination color of sunlit surfaces
    vec3 sunCol = vec3(1.2,1.1,1.0);

#ifdef SKY
    // Fancy sky!

    // Color of the sky where the Sun is
    float sunFactor = max(0.0, dot(sunDir, rayDir)) - 1.0;
    float glow = exp2(8.0 * sunFactor);
    sunFactor = exp2(800.0 * sunFactor) + 0.25 * glow;

    // Color of the sky where the Sun isn't
    float scatter = 1.0 - sqrt(max(0.0, sunDir.z));
    vec3 spaceCol = mix(vec3(0.1,0.3,0.5),vec3(0.0), scatter);
    vec3 scatterCol = mix(vec3(0.7, 0.9, 1.0),vec3(1.0,0.3,0.0), scatter);
    vec3 atmCol = mix(scatterCol, spaceCol, sqrt(max(0.0, rayDir.z)));

    vec2 skyPos = rayDir.xy / sqrt(rayDir.z + 0.03);
    skyPos *= 0.04 * sqrt(length(skyPos));
    skyPos += 1e-5 * vec2(iCamCellPos.xy);
    skyPos *= 1.0 + 4.0 * noise(skyPos, 0, iTime).xy;

    vec3 cloudVec = sqrt(noise(skyPos, 0, iTime));
    float cloudFactor = cloudVec.r + cloudVec.g * 0.5 + cloudVec.b * 0.25;
    cloudFactor = clamp(64.0*(cloudFactor - 1.3), 0.0, 1.0);
    vec3 cloudCol = mix(0.8*(1.0-atmCol), sunCol, cloudVec.g - cloudVec.b);

    // Mix where the Sun is and where the Sun isn't
    vec3 skyCol = vec3(1.4, 1.0, 0.5)*sunFactor + atmCol + cloudCol*cloudFactor;

    // Make far-away objects fade to the sky color,
    // also add the sky if we reached the void
    float skyFactor = (res.step == MAX_RAY_STEPS) ? 1.
      : min(dist*dist*dist*1e-8, 1.0);

    // Make sure values don't overflow (the Sun can be very bright)
    skyCol = clamp(skyCol, vec3(0), vec3(1));

    // Color the shadow the color of the sky
    vec3 shadeCol = mix(scatterCol, spaceCol, rayDir.z*0.5 + 0.5);
#else
    vec3 skyCol = mix(vec3(0.8, 0.9, 1.0), vec3(0.1, 0.3, 0.6), rayDir.z);
    vec3 shadeCol = skyCol * 0.7;
#endif
    // Make shadow slightly more gray
    shadeCol = mix(shadeCol, vec3(0.8), 0.3);

#ifdef AO
    // Do cheap ambient occlusion by interpolating SDFs
    float ambDist = sdf(
	res.cellPos + ivec3(res.normal),
	res.fractPos
	);
    float ambFactor = min(1.0 - sqrt(ambDist), 0.8);
    vec3 ambCol = mix(vec3(1), shadeCol, ambFactor);
#else
    vec3 ambCol = vec3(1);
#endif

    // Bounce the ray across the surface
    MAX_RAY_STEPS /= 2;
    MAX_SUN_STEPS /= 2;
    camCellPos = res.cellPos;
    camFractPos = res.fractPos;

    // Check if we're facing towards Sun
    float shadeFactor = sunDir.z < 0. ? 0. : max(0., dot(res.normal, sunDir));
#ifdef SHADOWS
    // March to the Sun unless we hit something along the way
    if( shadeFactor > 0.){
      March sun = march(camCellPos, camFractPos, sunDir * jitter, MAX_SUN_STEPS);
      shadeFactor *= clamp(sun.minDist, 0., 1.);
    }
    // TODO: soft shadows (aaa)
    // How to do: calculate the raymarcher's minDist more accurately
#endif

    // Mix sunlight and shade
    vec3 lightCol = mix(shadeCol, sunCol, shadeFactor);

    // Multiply everything together
    vec3 objCol = baseCol
      * normalCol
      * lightCol
      * ambCol;

    vec3 bounceCol = mix( objCol, skyCol, skyFactor ) * glassCol;

    col = mix(col, bounceCol, exp2(-float(i)) * bounceFactor);

    // If too much sky, stop bouncing
    bounceFactor = exp2(20.0 * dot(res.normal, rayDir));
    if(skyFactor > 0.95 || bounceFactor < 0.05) break;

    rayDir = reflect(rayDir, res.normal) * jitter;
  }

  // And we're done!
  FragColor.rgb = col;
}
