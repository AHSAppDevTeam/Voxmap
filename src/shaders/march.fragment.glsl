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
#define CLOUDS
#endif

#if QUALITY > 3
#define JITTER
#endif

in vec3 v_color;
in vec3 v_position;
out vec4 FragColor;

uniform highp sampler3D mapTexture;
uniform float iTime;
uniform vec3 iSunDir;
uniform int iFrame;

// Dimensions
const int X = 1024;
const int Y = 256;
const int Z = 16;

const float Xf = float(X);
const float Yf = float(Y);
const float Zf = float(Z);

const vec3 Mf = 1.0 / vec3(Xf, Yf, Zf);

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
vec3 project(vec2 p, int shift){
  p = fract(p) * (Yf - 4.0) + 2.0;
  return vec3(p.x, p.y, float(shift)) * Mf;
}
float noise(vec2 p, int shift) {
  return texture(mapTexture, project(p, shift)).a;
}

// Vector rotater
vec2 rotate2d(vec2 v, float a) {
  float sinA = sin(a);
  float cosA = cos(a);
  return vec2(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);
}

// Read data from texture
//------------------------

ivec3 tex(ivec3 c) {
  return ivec3(texelFetch(mapTexture, c, 0).rgb * 255.);
}
vec3 tex(vec3 c) {
  return texture(mapTexture, c*Mf).rgb * 255.;
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
float sdf(vec3 c) {
  vec3 d = tex(c);
  return min(d.r, d.g);
}

// Get color from texture's palette index
vec3 palette(int p) {
  return p==0?vec3(0.0431373,0.0627451,0.0745098):p==1?vec3(0.133333,0.490196,0.317647):p==2?vec3(0.180392,0.662745,0.87451):p==3?vec3(0.337255,0.423529,0.45098):p==4?vec3(0.392157,0.211765,0.235294):p==5?vec3(0.439216,0.486275,0.454902):p==6?vec3(0.505882,0.780392,0.831373):p==7?vec3(0.52549,0.65098,0.592157):p==8?vec3(0.666667,0.666667,0.666667):p==9?vec3(0.741176,0.752941,0.729412):p==10?vec3(0.768627,0.384314,0.262745):p==11?vec3(0.780392,0.243137,0.227451):p==12?vec3(0.854902,0.788235,0.65098):p==13?vec3(0.964706,0.772549,0.333333):p==14?vec3(0.984314,0.886275,0.317647):p==15?vec3(1,1,1):vec3(1);
}

// Raymarcher
//------------

// Output object
struct March {
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
March march( vec3 rayPos, vec3 rayDir, int MAX_STEPS ) {
  March res;

  // materials encountered (currently: glass or not glass)
  res.material = 0;
  int lastMaterial;

  // store initial ray direction (currently: for exiting glass)
  vec3 iRayDir = rayDir;

  // other initial values
  res.minDist = Zf;
  res.step = 0;
  res.rayPos = rayPos;

  vec3 axisCellDist;
  vec3 axisRayDist; vec3 minAxis; float minAxisDist;
  int dist = 1;

  // is ray up or down, because SDF is split for performance reasons
  int dir = rayDir.z > 0.0 ? 1 : 0;

  // Start marchin'
  while(res.step < MAX_STEPS && dist != 0) {
    // Distances to each axis
    axisCellDist = fract(-res.rayPos * sign(rayDir)) + 1e-4;

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
    res.rayPos += rayDir * float(dist) * minAxisDist;

    // Calculate normals
    res.normal = -sign(rayDir * minAxis);
    ivec3 c = ivec3(res.rayPos);
    ivec3 n = ivec3(res.normal);

    // Break early if sky
    if(any(greaterThanEqual(c, ivec3(X,Y,Z))) || any(lessThan(c, ivec3(0)))) {
      res.step = MAX_STEPS;
      break;
    }

    dist = sdf_dir(ivec3(res.rayPos), dir);

    // TODO: improve floating-point distance
    // currently just casted integer distance
    res.minDist = min(float(dist), res.minDist);

    if(dist == 0) {
      res.material = tex(ivec3(res.rayPos)).b;

      // Glass stuff
      if (res.material == 6) { // If glass

	// Go through the glass
	dist++;

	if(lastMaterial != 6) {
	  // Refract ray
	  res.glass += 1.0 - 0.5*abs(dot(rayDir, res.normal));
	  res.glass += sqrt(length(fract(res.rayPos) - 0.5));
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

  return res;
}

// Colorizer
//-----------

void main() {

  // Set opacity to 1
  FragColor.a = 1.0;

  vec3 sunDir = iSunDir;
  vec3 shadeCol = vec3(0.8);
  vec3 baseCol = v_color;
  vec3 v_normal = vec3(1);
  vec3 sunCol = vec3(1.2, 1.1, 1.0);

#ifdef AO
  // Do cheap ambient occlusion by interpolating SDFs
  float ambDist = sdf(v_position);
  float ambFactor = min(1.0 - sqrt(ambDist), 0.8);
  vec3 ambCol = mix(vec3(1), shadeCol, ambFactor);
#else
  vec3 ambCol = vec3(1);
#endif

  // Check if we're facing towards Sun
  float shadeFactor = sunDir.z < 0. ? 0. : max(0., dot(v_normal, sunDir));

  // Mix sunlight and shade
  vec3 lightCol = mix(shadeCol, sunCol, shadeFactor);

  // Multiply everything together
  FragColor.rgb = baseCol
    * lightCol
    * ambCol;
}
