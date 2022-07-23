#version 330 core
precision highp float;

in vec4 a_position;
in float a_color;
out vec3 v_color;
out vec3 v_position;

uniform mat4 u_matrix;

vec3 palette(int p) {
  return p==0?vec3(0.0431373,0.0627451,0.0745098):p==1?vec3(0.133333,0.490196,0.317647):p==2?vec3(0.180392,0.662745,0.87451):p==3?vec3(0.337255,0.423529,0.45098):p==4?vec3(0.392157,0.211765,0.235294):p==5?vec3(0.439216,0.486275,0.454902):p==6?vec3(0.505882,0.780392,0.831373):p==7?vec3(0.52549,0.65098,0.592157):p==8?vec3(0.666667,0.666667,0.666667):p==9?vec3(0.741176,0.752941,0.729412):p==10?vec3(0.768627,0.384314,0.262745):p==11?vec3(0.780392,0.243137,0.227451):p==12?vec3(0.854902,0.788235,0.65098):p==13?vec3(0.964706,0.772549,0.333333):p==14?vec3(0.984314,0.886275,0.317647):p==15?vec3(1,1,1):vec3(1);
}

void main() {
    vec4 position = u_matrix * a_position;
    gl_Position = vec4(position.xyz, position.z + 0.1);
    v_color = palette(int(a_color * 255.0));
    v_position = a_position.xyz;
}
