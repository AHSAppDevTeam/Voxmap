in ivec4 a_cellPos;
in ivec4 a_fractPos;
in int a_color;
in int a_normal;
in int a_id;

flat out ivec3 v_cellPos;
smooth out vec3 v_fractPos;
flat out vec3 v_color;
flat out vec3 v_normal;
smooth out vec3 v_rayDir;
flat out int v_id;

vec3 normal(int n) {
  return
    n==0?vec3(1,0,0):n==1?vec3(-1,0,0):n==2?vec3(0,1,0):n==3?vec3(0,-1,0):n==4?vec3(0,0,1):n==5?vec3(0,0,-1):vec3(0);
}

void main() {
    vec4 position = u_matrix * vec4(a_cellPos + a_fractPos);
    gl_Position = vec4(position.xyz, position.z + 1e-4);

    v_cellPos = a_cellPos.xyz;
    v_fractPos = vec3(a_fractPos.xyz);
    v_color = palette(a_color);
    v_normal = normal(a_normal);
    v_id = a_id;
}
