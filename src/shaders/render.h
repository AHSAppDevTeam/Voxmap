#version 300 es
precision highp float;
precision lowp int;

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
#define REFLECTIONS
#endif

#if QUALITY > 3
#define JITTER
#endif

uniform mat4 u_matrix;
uniform ivec3 u_cellPos;
uniform vec3 u_fractPos;
uniform int u_frame;
uniform float u_time;
uniform vec3 u_sunDir;

// Dimensions
const int X = 1024;
const int Y = 256;
const int Z = 32;

const int c_glass = 7;

const float Xf = float(X);
const float Yf = float(Y);
const float Zf = float(Z);

const vec3 Sf = 1.0 / vec3(Xf, Yf, Zf);

// Get color from texture's palette index
vec3 palette(int p) {
  return p==0?vec3(0,0,0):p==1?vec3(0.0431373,0.0627451,0.0745098):p==2?vec3(0.133333,0.490196,0.317647):p==3?vec3(0.337255,0.423529,0.45098):p==4?vec3(0.392157,0.211765,0.235294):p==5?vec3(0.439216,0.486275,0.454902):p==6?vec3(0.454902,0.403922,0.243137):p==7?vec3(0.505882,0.780392,0.831373):p==8?vec3(0.52549,0.65098,0.592157):p==9?vec3(0.52549,0.756863,0.4):p==10?vec3(0.647059,0.870588,0.894118):p==11?vec3(0.666667,0.666667,0.666667):p==12?vec3(0.741176,0.752941,0.729412):p==13?vec3(0.768627,0.384314,0.262745):p==14?vec3(0.780392,0.243137,0.227451):p==15?vec3(0.854902,0.788235,0.65098):p==16?vec3(0.964706,0.772549,0.333333):p==17?vec3(0.984314,0.886275,0.317647):p==18?vec3(1,1,1):vec3(1);
}


