#version 300 es
precision highp float;
precision lowp int;

uniform int u_quality;
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


