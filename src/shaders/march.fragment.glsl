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
#define QUALITY 2

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

// Quality-adjustable raytracing parameters
const int MAX_BOUNCES = max(QUALITY - 1, 1);
int MAX_RAY_STEPS = X * (QUALITY + 1)/3;
int MAX_SUN_STEPS = Z * (QUALITY + 2);

// Utility functions
//-------------------

// Pseudo random number maker
int hash(int a, int b){
  return ((a + b)*(a + b + 1) + b*2) % 255;
}
int hash(ivec3 v){
  return hash(hash(v.x,v.y),v.z);
}
int hash(ivec3 a, ivec3 b){
  return hash(hash(a), hash(b));
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
// Return regular SDF for certain applications,
// like ambient occlusion
int sdf(ivec3 c) {
  return min(sdf_dir(c,0), sdf_dir(c,1));
}
// Fancy trilinear interpolator (stolen from Wikipedia)
float sdf(ivec3 c, vec3 f, vec3 n) {
  c += ivec3(n);
  f = f - 0.5;
  ivec3 dir = ivec3(sign(f));
  f = abs(f);
#define D3(X,Y,Z) ( float(sdf(c + dir * ivec3(X,Y,Z))) )
#define D2(Y,Z) ( mix(D3(0,Y,Z), D3(1,Y,Z), f.x) )
#define D1(Z)   ( mix(D2(0,Z),   D2(1,Z),   f.y) )
#define D0      ( mix(D1(0),     D1(1),     f.z) )
  return D0;
}

// Get color from texture's palette index
vec3 color(ivec3 c) {
  int p = tex(c).b;
  return p==0?vec3(0,0,0):p==1?vec3(0.0431373,0.0627451,0.0745098):p==2?vec3(0.133333,0.490196,0.317647):p==3?vec3(0.392157,0.211765,0.235294):p==4?vec3(0.439216,0.486275,0.454902):p==5?vec3(0.505882,0.780392,0.831373):p==6?vec3(0.52549,0.65098,0.592157):p==7?vec3(0.666667,0.666667,0.666667):p==8?vec3(0.741176,0.752941,0.729412):p==9?vec3(0.768627,0.384314,0.262745):p==10?vec3(0.780392,0.243137,0.227451):p==11?vec3(0.854902,0.788235,0.65098):p==12?vec3(0.964706,0.772549,0.333333):p==13?vec3(1,1,1):vec3(1);
}
// Base color + sub-voxel noise
vec3 color(ivec3 c, vec3 f){
  ivec3 p = ivec3(f*12.0);
  return color(c) * (1. - vec3(hash(c, p) % 255)/255./64.);
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
};

// Cube-accelerated code-spaghetti raymarcher
// Based on Xor's [shadertoy.com/view/fstSRH]
// and modified in order to support integer coordinates
March march( ivec3 rayCellPos, vec3 rayFractPos, vec3 rayDir, int MAX_STEPS ) {
  March res;

  // materials encountered (currently: glass or not glass)
  int material;
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

    material = tex(res.cellPos).b;

    // Glass stuff
    if (material == 5) { // If glass

      // Go through the glass
      dist++;

      if(lastMaterial != 5) { // If not glass --> glass
	// Refract ray
	res.glass+= 1.0 - abs(dot(rayDir, res.normal))*0.5;
	rayDir = refract(rayDir, res.normal, 0.9);
      }

    } else if (lastMaterial == 5) { // If glass --> not glass

      // Refract ray back to original direction if glass to not glass
      rayDir = iRayDir;

    }

    lastMaterial = material;

    res.step++;
  }
  res.rayPos = vec3(res.cellPos) + res.fractPos;

  return res;
}

// Signed distance field to make the triangular pointer
// in the minimap.
float sdTriangleIsosceles( in vec2 p, in vec2 q )
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

  vec2 screenPos = TexCoord * 0.6;

#ifdef JITTER
  int modFrame = iFrame % 4;
  vec2 e = 0.5 / iResolution;
  screenPos.x += (modFrame > 1) ? e.x : -e.x;
  screenPos.y += (modFrame % 2 == 0) ? e.y : -e.y;
#endif

  vec3 camDir = vec3(0, 1, 0);
  vec3 camPlaneU = vec3(1, 0, 0);
  vec3 camPlaneV = vec3(0, 0, 1) * iResolution.y / iResolution.x;

  // Distinguish regular camera & minimap 
  float miniSize = 1./4.;
  float miniPos = 1. - miniSize;
  bool inMini = all(greaterThan(TexCoord, vec2(miniPos - miniSize)));
  if( inMini ) {
    // Orthographic overhead minimap camera
    camFractPos.xyz = vec3(0.5);
    camCellPos.xy += ivec2((TexCoord - miniPos)*Yf);
    camCellPos.z = Z + 1;
    rayDir = normalize(vec3(.01,.01,-1.));
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

  // Start marchin'!
  for(int i = 0; i < MAX_BOUNCES; i++) {

    // Get result of marching
    March res = march(camCellPos, camFractPos, rayDir, MAX_RAY_STEPS);

    // Intersection distance
    float dist = length(res.rayPos.xy - vec2(camCellPos.xy));

    // Start coloring!

    // Get base color (matte & shadowless) from texture
    vec3 baseCol = color(res.cellPos, res.fractPos);

    // Mix in any glass we hit along the way
    vec3 glassCol = mix(vec3(0.3, 0.5, 0.7), vec3(1), exp(-res.glass));

    // A touch of brightness for tall things
    vec3 heightCol = vec3(float(clamp(res.rayPos.z, 0., 1.))/Zf + 5.)/6.;

    // Darken faces with ±X, ±Y, or -Z normals
    vec3 normalCol = mat3x3(
	0.90, 0.90, 0.95,
	0.95, 0.95, 1.00,
	1.00, 1.00, 1.00
	) * abs(res.normal);
    if(res.normal.z < 0.) normalCol *= 0.8;

    // Illumination color of sunlit surfaces
    vec3 sunCol = vec3(1.2,1.1,1.0);

#if QUALITY > 0
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
    shadeCol = mix(shadeCol, vec3(0.8), 0.5);

#if QUALITY > 1
    // Do cheap ambient occlusion by interpolating SDFs
    float ambFactor = pow(sdf(res.cellPos, res.fractPos, res.normal)*2., 0.5);
    vec3 ambCol = mix(shadeCol, vec3(1), ambFactor);
#else
    vec3 ambCol = vec3(1);
#endif
    
    // Bounce the ray across the surface
    MAX_RAY_STEPS /= 2;
    MAX_SUN_STEPS /= 2;
    camCellPos = res.cellPos;
    camFractPos = res.fractPos + 1e-4;
    rayDir -= 2.0 * dot(rayDir, res.normal) * res.normal;

    // Check if we're facing towards Sun
    float shadeFactor = sunDir.z < 0. ? 0. : max(0., dot(res.normal, sunDir));
#if QUALITY > 0
    // March to the Sun unless we hit something along the way
    if( shadeFactor > 0.){
      March sun = march(camCellPos, camFractPos, sunDir, MAX_SUN_STEPS);
      shadeFactor *= clamp(sun.minDist, 0., 1.);
    }
    // TODO: soft shadows (aaa)
    // How to do: calculate the raymarcher's minDist more accurately
#endif

    // Mix sunlight and shade
    vec3 lightCol = mix(shadeCol, sunCol, shadeFactor);

    // Multiply everything together
    vec3 objCol = baseCol
      * glassCol
      * normalCol
      * heightCol
      * lightCol
      * ambCol;

    // Make far-away objects fade to the sky color,
    // also add the sky if we reached the void
    float skyFactor = (res.step == MAX_RAY_STEPS || res.minDist > Zf) ? 1.
      : pow(clamp(dist/Yf, 0., 1.), 3.);
    vec3 bounceCol = mix( objCol, skyCol, skyFactor );

    // Mix with previous bounces
    col = mix(col, bounceCol, exp(-float(3*i)));

    // If too much sky, stop bouncing
    if(skyFactor > 0.99) break;
  }

  // Highlight viewing range triangle
  if(inMini && sdTriangleIsosceles(rotate2d(TexCoord - miniPos, -camRot.z), vec2(0.2,0.6)) < 0.) {
    col *= 1.5;
  }

  // And we're done!
  FragColor.rgb = col;
  FragColor.a = 1.0;
}
