attribute vec4 a_cellPos;
attribute vec4 a_fractPos;
attribute float a_color;
attribute float a_normal;
attribute float a_id;

varying vec3 _v_cellPos;
varying vec3 _v_fractPos;
varying vec3 v_color;
varying vec3 v_normal;
varying vec3 v_rayDir;
varying float _v_id;

vec3 normal(int n) {
  return
    n==0?vec3(1,0,0):n==1?vec3(-1,0,0):n==2?vec3(0,1,0):n==3?vec3(0,-1,0):n==4?vec3(0,0,1):n==5?vec3(0,0,-1):vec3(0);
}

// Get color from texture's palette index
vec3 palette(int p) {
  return
    p==0?vec3(0,0,0):p==1?vec3(0.0431373,0.0627451,0.0745098):p==2?vec3(0.133333,0.490196,0.317647):p==3?vec3(0.337255,0.423529,0.45098):p==4?vec3(0.392157,0.211765,0.235294):p==5?vec3(0.439216,0.486275,0.454902):p==6?vec3(0.454902,0.403922,0.243137):p==7?vec3(0.52549,0.65098,0.592157):p==8?vec3(0.52549,0.756863,0.4):p==9?vec3(0.647059,0.870588,0.894118):p==10?vec3(0.666667,0.666667,0.666667):p==11?vec3(0.741176,0.752941,0.729412):p==12?vec3(0.768627,0.384314,0.262745):p==13?vec3(0.780392,0.243137,0.227451):p==14?vec3(0.854902,0.788235,0.65098):p==15?vec3(0.964706,0.772549,0.333333):p==16?vec3(0.984314,0.886275,0.317647):p==17?vec3(1,1,1):p==18?vec3(0.5):vec3(1);
}

void main() {
    vec4 position = u_matrix * vec4(a_cellPos + a_fractPos);
    gl_Position = vec4(position.xyz, position.z + 1e-4);

    _v_cellPos = a_cellPos.xyz;
    _v_fractPos = vec3(a_fractPos.xyz);
    v_color = palette(int(a_color));
    v_normal = normal(int(a_normal));
    _v_id = a_id;
}
