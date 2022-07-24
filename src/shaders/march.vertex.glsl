#version 330 core
precision highp float;
precision lowp int;

in ivec4 a_cellPos;
in ivec4 a_fractPos;
in int a_color;
in int a_normal;
in int a_id;

flat out ivec3 v_cellPos;
smooth out vec3 v_fractPos;
flat out int v_color;
flat out int v_normal;
flat out int v_id;

uniform mat4 u_matrix;
uniform ivec3 u_cellPos;
uniform vec3 u_fractPos;

// Dimensions
const int X = 1024;
const int Y = 256;
const int Z = 16;

void main() {
    vec4 position = u_matrix * vec4(a_cellPos + a_fractPos);
    gl_Position = vec4(position.xyz, position.z + 1e-5);

    v_cellPos = a_cellPos.xyz;
    v_fractPos = vec3(a_fractPos.xyz);
    v_color = a_color;
    v_normal = a_normal;
    v_id = a_id;
}
