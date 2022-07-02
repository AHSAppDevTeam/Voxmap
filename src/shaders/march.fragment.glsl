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

const int X = 1024;
const int Y = 256;
const int Z = 16;

const float Xf = float(X);
const float Yf = float(Y);
const float Zf = float(Z);

const int GAP = 8;
const int ZERO = 8;

const int MAX_BOUNCES = max(QUALITY - 1, 1);
int MAX_RAY_STEPS = X * (QUALITY + 1)/3;
int MAX_SUN_STEPS = Z * (QUALITY + 2);

int hash(int a, int b){
  return ((a + b)*(a + b + 1) + b*2) % 255;
}
int hash(ivec3 v){
  return hash(hash(v.x,v.y),v.z);
}
int hash(ivec3 a, ivec3 b){
  return hash(hash(a), hash(b));
}

ivec3 tex(ivec3 c) {
  c.x = clamp(c.x, 0, X-1);
  c.y = clamp(c.y, 0, Y-1);
  c.z = clamp(c.z, 0, Z-1);
  ivec3 v = ivec3(texelFetch(mapTexture, ivec2(c.x, c.y + Y*c.z), 0).rgb);
  if(v.b == 7) v.b = 10; // aaaaa
  return (v+6)/8;
}
int sdf_dir(ivec3 c, int dir) {
  ivec2 d = tex(c).rg;
  return (d.r + max(0, c.z - Z))*dir + d.g*(1-dir);
}
int sdf(ivec3 c) {
  return min(sdf_dir(c,0), sdf_dir(c,1));
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
  int p = tex(c).b;
  return p==0?vec3(0,0,0):p==1?vec3(0.0431373,0.0627451,0.0745098):p==2?vec3(0.133333,0.490196,0.317647):p==3?vec3(0.180392,0.662745,0.87451):p==4?vec3(0.392157,0.211765,0.235294):p==5?vec3(0.439216,0.486275,0.454902):p==6?vec3(0.505882,0.780392,0.831373):p==7?vec3(0.52549,0.65098,0.592157):p==8?vec3(0.666667,0.666667,0.666667):p==9?vec3(0.694118,0.705882,0.47451):p==10?vec3(0.741176,0.752941,0.729412):p==11?vec3(0.768627,0.384314,0.262745):p==12?vec3(0.780392,0.243137,0.227451):p==13?vec3(0.854902,0.788235,0.65098):p==14?vec3(0.866667,0.823529,0.231373):p==15?vec3(1,1,1):vec3(1);
}

vec3 color(ivec3 c, vec3 f){
  ivec3 p = ivec3(f*12.0);
  return color(c) * (1. - vec3(hash(c, p) % 255)/255./32.);
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

March march( ivec3 rayCellPos, vec3 rayFractPos, vec3 rayDir, int MAX_STEPS ) {
  March res;

  res.minDist = Zf;
  res.step = 0;
  res.cellPos = rayCellPos;
  res.fractPos = rayFractPos;

  vec3 axisCellDist;
  vec3 axisRayDist; vec3 minAxis; float minAxisDist;
  int dist = 1;
  int dir = rayDir.z > 0.0 ? 1 : 0;
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
    ivec3 c = res.cellPos;
    ivec3 n = ivec3(res.normal);
    if(any(greaterThan(c, ivec3(X,Y,Z))) || any(lessThan(c, ivec3(0)))) {
      res.minDist = Zf+1.;
      break;
    }

    dist = sdf_dir(res.cellPos, dir);
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
  FragColor.a = 1.0;
  ivec3 camCellPos = iCamCellPos;
  vec3 camFractPos = iCamFractPos;
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
    camFractPos.xyz = vec3(0.5);
    camCellPos.xy += ivec2((TexCoord - miniPos)*Yf);
    camCellPos.z = Z + 1;
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

    March res = march(camCellPos, camFractPos, rayDir, MAX_RAY_STEPS);
    float dist = length(res.rayPos.xy - vec2(camCellPos.xy));

    // Start coloring

    vec3 baseCol = color(res.cellPos, res.fractPos);

    vec3 heightCol = vec3(float(clamp(res.rayPos.z, 0., 1.))/Zf + 5.)/6.;

    vec3 normalCol = mat3x3(
	0.85, 0.95, 1.0,
	0.90, 0.90, 1.0,
	1.00, 1.00, 1.0
	) * abs(res.normal);
    if(res.normal.z < 0.) normalCol *= 0.8;

    vec3 sunCol = vec3(1.2,1.1,1.0);

#if QUALITY > 0
    float sunFactor = max(0., dot(sunDir, rayDir));
    float scatter = 1.0 - pow(max(0.0, sunDir.z), 0.3);
    vec3 spaceCol = mix(vec3(0.1,0.3,0.6),vec3(0.0), scatter);
    vec3 scatterCol = mix(vec3(1.0),vec3(1.0,0.3,0.0), scatter);
    vec3 atmCol = mix(scatterCol, spaceCol, pow(max(0.0, rayDir.z), 0.5));

    float sun = sunFactor;
    float glow = sun;
    sun = 0.5 * pow(sun,800.0);
    glow = pow(glow,6.0) * 1.0;
    glow = clamp(glow,0.0,1.0);
    sun += glow / 4.;

    vec3 skyCol = vec3(1.4, 1.0, 0.5)*sun + atmCol;
    skyCol = clamp(skyCol, vec3(0), vec3(1));

    vec3 shadeCol = mix(scatterCol, spaceCol, rayDir.z*0.5 + 0.5);
#else
    vec3 skyCol = mix(vec3(0.8, 0.9, 1.0), vec3(0.1, 0.3, 0.6), rayDir.z);
    vec3 shadeCol = skyCol * 0.7;
#endif

#if QUALITY > 1
    float ambFactor = pow(sdf(res.cellPos, res.fractPos)*2., 0.5);
    vec3 ambCol = mix(shadeCol, vec3(1), ambFactor);
#else
    vec3 ambCol = vec3(1);
#endif
    
    // Bounce
    MAX_RAY_STEPS /= 2;
    MAX_SUN_STEPS /= 2;
    camCellPos = res.cellPos;
    camFractPos = res.fractPos + 1e-4;
    rayDir -= 2.0 * dot(rayDir, res.normal) * res.normal;

    float shadeFactor = sunDir.z < 0. ? 0. : max(0., dot(res.normal, sunDir));
#if QUALITY > 0
    if( shadeFactor > 0.){
      March sun = march(camCellPos, camFractPos, sunDir, MAX_SUN_STEPS);
      shadeFactor *= clamp(sun.minDist, 0., 1.);
    }
#endif
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
    col = mix(col, bounceCol, exp(-float(3*i)));
    if(skyFactor > 0.99) break;
  }

  if(inMini && sdTriangleIsosceles(rotate2d(TexCoord - miniPos, -camRot.z), vec2(0.2,0.6)) < 0.) {
    col *= 1.5;
  }
  FragColor.rgb = col;
  FragColor.a = 1.0;
}
