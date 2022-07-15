#version 330 core
precision highp float;
precision highp int;

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

in vec2 TexCoord;

uniform highp usampler2D mapTexture;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 iCamRot;

uniform ivec3 iCamCellPos;
uniform vec3 iCamFractPos;

uniform int iFrame;

// Dimensions
const int X = 1024;
const int Y = 256;
const int Z = 16;

const float Xf = float(X);
const float Yf = float(Y);
const float Zf = float(Z);

const float FoV = 1.0;

// Quality-adjustable raytracing parameters
const int MAX_BOUNCES = max(QUALITY - 1, 1);
int MAX_RAY_STEPS = X * (QUALITY + 1)/3;
int MAX_SUN_STEPS = Z * (QUALITY + 2);

// Utility functions
//-------------------

vec3 hash(vec3 p3)
{
    p3 = fract(p3 * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz+33.33);
    return fract((p3.xxy + p3.yxx)*p3.zyx) - 0.5;
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
  return ivec3(texelFetch(mapTexture, project(c), 0).rgb);
  // TODO: this gives the wrong color for Firefox
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
  f = f - 0.5;
  ivec3 dir = ivec3(sign(f));
  f = abs(f);
#define D3(X,Y,Z) ( vec3(tex(c + dir * ivec3(X,Y,Z))) )
#define D2(Y,Z) ( mix(D3(0,Y,Z), D3(1,Y,Z), f.x) )
#define D1(Z)   ( mix(D2(0,Z),   D2(1,Z),   f.y) )
#define D0      ( mix(D1(0),     D1(1),     f.z) )
  vec3 o = D0;
  return min(o.r, o.g);
}

// Get color from texture's palette index
vec3 palette(int p) {
  return p==0?vec3(0,0,0):p==1?vec3(0.0431373,0.0627451,0.0745098):p==2?vec3(0.133333,0.490196,0.317647):p==3?vec3(0.180392,0.662745,0.87451):p==4?vec3(0.337255,0.423529,0.45098):p==5?vec3(0.392157,0.211765,0.235294):p==6?vec3(0.439216,0.486275,0.454902):p==7?vec3(0.505882,0.780392,0.831373):p==8?vec3(0.52549,0.65098,0.592157):p==9?vec3(0.666667,0.666667,0.666667):p==10?vec3(0.741176,0.752941,0.729412):p==11?vec3(0.768627,0.384314,0.262745):p==12?vec3(0.780392,0.243137,0.227451):p==13?vec3(0.854902,0.788235,0.65098):p==14?vec3(0.964706,0.772549,0.333333):p==15?vec3(0.984314,0.886275,0.317647):p==16?vec3(1,1,1):vec3(1);
}
vec3 color(ivec3 c){
  return palette(tex(c).b);
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
      res.minDist = Zf+1.;
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

// Signed distance field to make the triangular pointer
// in the minimap.
float sdTriangle( in vec2 p, in vec2 q )
{
  p.x = abs(p.x);
  vec2 a = p - q*clamp( dot(p,q)/dot(q,q), 0.0, 1.0 );
  vec2 b = p - q*vec2( clamp( p.x/q.x, 0.0, 1.0 ), 1.0 );
  float s = -sign( q.y );
  vec2 d = min( vec2( dot(a,a), s*(p.x*q.y-p.y*q.x) ),
      vec2( dot(b,b), s*(p.y-q.y)  ));
  return -sqrt(d.x)*sign(d.y);
}

// Colorizer
//-----------

void main() {

  // Set opacity to 1
  FragColor.a = 1.0;

  // Marching setup
  ivec3 camCellPos = iCamCellPos;
  vec3 camFractPos = iCamFractPos + 1e-3;
  vec3 camRot = iCamRot;
  vec3 rayDir;

  vec2 screenPos = TexCoord * FoV;

  vec3 camDir = vec3(0, 1, 0);
  vec3 camPlaneU = vec3(1, 0, 0);
  vec3 camPlaneV = vec3(0, 0, 1) * iResolution.y / iResolution.x;

#ifdef JITTER
  vec3 noise = 1.0 + 0.1 * hash(gl_FragCoord.xyx);
#else
  vec3 noise = vec3(1.0);
#endif

  // Distinguish regular camera & minimap 
  vec2 miniPos = vec2(0, 0.7);
  screenPos += 0.5 * miniPos;
  bool inMini = TexCoord.y > 0.4;
  if( inMini ) {
    // Orthographic overhead minimap camera
    camFractPos.xyz = vec3(0.5);
    camCellPos.xy += ivec2((TexCoord - miniPos)*Yf);
    camCellPos.z = Z + 1;
    rayDir = normalize(vec3(-1,3,-6));
  } else {
    // First-person rectilinear perspective camera
    rayDir = normalize(
	camDir
	+ screenPos.x * camPlaneU
	+ screenPos.y * camPlaneV
	);
    rayDir.yz = rotate2d(rayDir.yz, camRot.x);
    rayDir.xy = rotate2d(rayDir.xy, camRot.z);
  }

  // Set up the Sun
  vec3 sunDir = normalize(vec3(0,0,1));
  sunDir.xz = rotate2d(sunDir.xz, iTime/17.);
  sunDir.xy = rotate2d(sunDir.xy, sin(iTime/31.)/3.);
  sunDir.z = abs(sunDir.z);

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
    vec3 glassCol = mix(vec3(0.3, 0.5, 0.7), vec3(1), exp(-res.glass));

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
    float sunFactor = max(0., dot(sunDir, rayDir));
    float sun = sunFactor;
    float glow = sun;
    sun = 0.5 * pow(sun,800.0);
    glow = pow(glow,6.0) * 1.0;
    glow = clamp(glow,0.0,1.0);
    sun += glow / 4.;

    // Color of the sky where the Sun isn't
    float scatter = 1.0 - pow(max(0.0, sunDir.z), 0.3);
    vec3 spaceCol = mix(vec3(0.1,0.3,0.5),vec3(0.0), scatter);
    vec3 scatterCol = mix(vec3(0.7, 0.9, 1.0),vec3(1.0,0.3,0.0), scatter);
    vec3 atmCol = mix(scatterCol, spaceCol, pow(max(0.0, rayDir.z), 0.5));

    // Mix where the Sun is and where the Sun isn't
    vec3 skyCol = vec3(1.4, 1.0, 0.5)*sun + atmCol;

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
      March sun = march(camCellPos, camFractPos, sunDir * noise, MAX_SUN_STEPS);
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

    // Make far-away objects fade to the sky color,
    // also add the sky if we reached the void
    float skyFactor = (res.step == MAX_RAY_STEPS || res.minDist > Zf) ? 1.
      : pow(clamp(dist/Yf, 0., 1.), 3.);
    vec3 bounceCol = mix( objCol, skyCol, skyFactor ) * glassCol;

    col = mix(col, bounceCol, exp(-float(i)) * bounceFactor);

    // If too much sky, stop bouncing
    bounceFactor = 1.0 - 2.0 * sqrt(dot(-res.normal, rayDir));
    if(inMini || skyFactor > 0.95 || bounceFactor < 0.0) break;

    rayDir = reflect(rayDir, res.normal) * noise;
  }

  // Highlight viewing range triangle
  if(inMini && sdTriangle(rotate2d(TexCoord - miniPos, -camRot.z), vec2(0.5,1.5)) < 0.) {
    col *= 1.5;
  }

  // And we're done!
  FragColor.rgb = col;
  FragColor.a = 1.0;
}
