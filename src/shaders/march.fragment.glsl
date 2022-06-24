#version 330 core
precision highp float;
precision highp int;

// Quality settings:
//    Reflections,  Ambient occlusion,	Render distance
// 0: no,	    no,			short
// 1: no,	    yes,		long
// 2: yes,	    yes,		long
#define QUALITY 1

out vec4 FragColor;

in vec2 TexCoord;

uniform highp usampler2D mapTexture;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 iCamRot;
uniform vec3 iCamPos;

const int X = 1024;
const int Y = 256;
const int Z = 16;

const float Xf = float(X);
const float Yf = float(Y);
const float Zf = float(Z);

const int MAX_BOUNCES = QUALITY/2 + 1;
int MAX_RAY_STEPS = X * (QUALITY + 1)/2;
int MAX_SUN_STEPS = Z * (QUALITY + 2);

int hash(int a, int b){
  return ((a + b)*(a + b + 1) + b*2) % 255;
}
int hash(int a, int b, int c){
  return hash(hash(a,b),c);
}

ivec3 tex(ivec3 c) {
  c.x = clamp(c.x + X/2, 0, X-1);
  c.y = clamp(c.y + Y/2, 0, Y-1);
  c.z = clamp(c.z, 0, Z-1);
  return ivec3(texelFetch(mapTexture, ivec2(c.x, c.y + Y*c.z), 0) + 7u)/8;
}
int sdf(ivec3 c) {
  return tex(c).r + max(0, c.z - Z);
}
float sdf(ivec3 c, vec3 f) {
  f = f - 0.5;
  ivec3 dir = ivec3(sign(f));
  f = abs(f);
#define D3(X,Y,Z) ( float(sdf(c + dir * ivec3(X,Y,Z))) )
#define D2(Y,Z) ( mix(D3(0,Y,Z), D3(1,Y,Z), f.x) )
#define D1(Z)   ( mix(D2(0,Z),   D2(1,Z),   f.y) )
#define D0      ( mix(D1(0),     D1(1),     f.z) )
  return D0;
}

vec3 color(ivec3 c) {
  int p = tex(c).g;
  vec3 base = p<=0?vec3(0,0,0):p<=1?vec3(0.133333,0.490196,0.317647):p<=2?vec3(0.180392,0.662745,0.87451):p<=3?vec3(0.235294,0.184314,0.254902):p<=4?vec3(0.392157,0.211765,0.235294):p<=5?vec3(0.439216,0.486275,0.454902):p<=6?vec3(0.505882,0.780392,0.831373):p<=7?vec3(0.52549,0.65098,0.592157):p<=8?vec3(0.666667,0.666667,0.666667):p<=9?vec3(0.694118,0.705882,0.47451):p<=10?vec3(0.741176,0.752941,0.729412):p<=11?vec3(0.768627,0.384314,0.262745):p<=12?vec3(0.780392,0.243137,0.227451):p<=13?vec3(0.854902,0.788235,0.65098):p<=14?vec3(1,1,1):vec3(1);
  base *= 1. - vec3(hash(c.x, c.y, c.z) % 255)/255./64.;
  return base;
}

vec2 rotate2d(vec2 v, float a) {
  float sinA = sin(a);
  float cosA = cos(a);
  return vec2(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);
}

struct March {
  ivec3 cellPos;
  vec3 fractPos;
  vec3 rayPos;
  vec3 normal;
  float minDist;
  int step;
};

March march( vec3 rayPos, vec3 rayDir, int MAX_STEPS ) {
  March res;

  res.minDist = Zf;
  res.step = 0;
  res.cellPos = ivec3(floor(rayPos));
  res.fractPos = fract(rayPos);

  vec3 axisCellDist;
  vec3 axisRayDist; vec3 minAxis; float minAxisDist;
  int dist = 1;
  // Start marchin'
  while(res.step < MAX_STEPS && dist != 0) {
    int safeDist = max(1, dist-1); // works for some reason

    axisCellDist = fract(-res.fractPos * sign(rayDir)) + 1e-4;
    axisRayDist = axisCellDist / abs(rayDir);
    minAxis = vec3(lessThanEqual(
	  axisRayDist.xyz, min(
	    axisRayDist.yzx,
	    axisRayDist.zxy
	    )));
    minAxisDist = length(minAxis * axisRayDist);
    res.fractPos += rayDir * float(safeDist) * minAxisDist;
    res.cellPos += ivec3(floor(res.fractPos));
    res.fractPos = fract(res.fractPos);

    res.normal = -sign(rayDir * minAxis);
    ivec3 n = ivec3(res.normal);

    if(
	(res.cellPos.z > Z && n.z < 0) ||
	(abs(res.cellPos.y) > Y/2 && sign(n.y*res.cellPos.y) < 0) ||
	(abs(res.cellPos.x) > X/2 && sign(n.x*res.cellPos.x) < 0)
      ) {
      res.minDist = Zf+1.;
      break;
    }

    dist = sdf(res.cellPos);
    res.minDist = min(float(dist), res.minDist);

    res.step++;
  }
  res.rayPos = vec3(res.cellPos) + res.fractPos;

  return res;
}
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
void main() { // Marching setup
  vec3 camPos = iCamPos;
  vec3 camRot = iCamRot;
  vec3 rayDir;

  vec2 screenPos = TexCoord * 0.6;

  vec3 camDir = vec3(0, 1, 0);
  vec3 camPlaneU = vec3(1, 0, 0);
  vec3 camPlaneV = vec3(0, 0, 1) * iResolution.y / iResolution.x;

  float miniSize = 1./4.;
  float miniPos = 1. - miniSize;
  bool inMini = all(greaterThan(TexCoord, vec2(miniPos - miniSize)));
  if( inMini ) {
    //minimap
    camPos = vec3((TexCoord - miniPos)*Yf + iCamPos.xy, Z+1);
    rayDir = normalize(vec3(.01,.01,-1.));
  } else {
    rayDir = normalize(
	camDir
	+ screenPos.x * camPlaneU
	+ screenPos.y * camPlaneV
	);
    rayDir.yz = rotate2d(rayDir.yz, camRot.x);
    rayDir.xy = rotate2d(rayDir.xy, camRot.z);
  }

  vec3 sunDir = normalize(vec3(0,0,1));
  sunDir.xz = rotate2d(sunDir.xz, iTime/17.);
  sunDir.xy = rotate2d(sunDir.xy, sin(iTime/31.)/3.);
  sunDir.z = abs(sunDir.z);

  vec3 col;

  for(int i = 0; i < MAX_BOUNCES; i++) {
    vec3 bounceCol;

    March res = march(camPos, rayDir, MAX_RAY_STEPS);
    float dist = length(res.rayPos.xy - camPos.xy);

    // Start coloring

    vec3 baseCol = color(res.cellPos);

    vec3 heightCol = vec3(float(clamp(res.rayPos.z, 0., 1.))/Zf + 5.)/6.;

    vec3 normalCol = mat3x3(
	0.85, 0.95, 1.0,
	0.90, 0.90, 1.0,
	1.00, 1.00, 1.0
	) * abs(res.normal);
    if(res.normal.z < 0.) normalCol *= 0.8;

    float sunFactor = max(0., dot(sunDir, rayDir));
    float scatter = 1.0 - pow(max(0.0, sunDir.z), 0.3);
    vec3 spaceCol = mix(vec3(0.1,0.3,0.6),vec3(0.0), scatter);
    vec3 scatterCol = mix(vec3(1.0),vec3(1.0,0.3,0.0), scatter);
    vec3 atmCol = mix(scatterCol, spaceCol, pow(max(0.0, rayDir.z), 0.5));
    vec3 sunCol = vec3(1.2,1.1,1.0);

    float sun = sunFactor;
    float glow = sun;
    sun = 0.5 * pow(sun,800.0);
    glow = pow(glow,6.0) * 1.0;
    glow = clamp(glow,0.0,1.0);
    sun += glow / 4.;

    vec3 skyCol = vec3(1.4, 1.0, 0.5)*sun + atmCol;
    skyCol = clamp(skyCol, vec3(0), vec3(1));

    vec3 shadeCol = mix(scatterCol, spaceCol, rayDir.z*0.5 + 0.5);

#if QUALITY > 0
    float ambFactor = pow(sdf(res.cellPos, res.fractPos)*2., 0.5);
    vec3 ambCol = mix(shadeCol, vec3(1), ambFactor);
#else
    vec3 ambCol = vec3(1);
#endif

    // Bounce
    camPos = res.rayPos + res.normal * 1e-3;
    rayDir -= 2.0 * dot(rayDir, res.normal) * res.normal;

    float shadeFactor = sunDir.z < 0. ? 0. : max(0., dot(res.normal, sunDir));
    if( shadeFactor > 0.){
      March sun = march(camPos, sunDir, MAX_SUN_STEPS);
      shadeFactor *= clamp(sun.minDist, 0., 1.);
    }
    vec3 lightCol = mix(shadeCol, sunCol, shadeFactor);

    vec3 objCol = baseCol
      * normalCol
      * heightCol
      * lightCol
      * ambCol
      * 1.0;

    float skyFactor = (res.step == MAX_RAY_STEPS || res.minDist > Zf) ? 1.
      : pow(clamp(dist/Yf, 0., 1.), 3.);

    bounceCol = mix( objCol, skyCol, skyFactor );
    col = mix(col, bounceCol, exp(-float(2*i)));
    if(skyFactor > 0.99) break;
    MAX_RAY_STEPS /= 2;
    MAX_SUN_STEPS /= 2;
  }

  if(inMini && sdTriangleIsosceles(rotate2d(TexCoord - miniPos, -camRot.z), vec2(0.2,0.6)) < 0.) {
    col *= 1.5;
  }
  FragColor.rgb = col;
  FragColor.a = 1.0;
}
