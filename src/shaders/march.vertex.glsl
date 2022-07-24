#version 330 core
precision highp float;
precision lowp int;

in ivec4 a_cellPos;
in ivec4 a_fractPos;
in int a_color;
in int a_normal;
in int a_id;

flat out ivec3 v_cellPos;
out vec3 v_fractPos;
flat out int v_color;
flat out int v_normal;

uniform mat4 u_matrix;

void main() {
    vec4 position = u_matrix * vec4(a_cellPos + a_fractPos);
    gl_Position = vec4(position.xyz, position.z + 1e-5);
    v_color = a_color + 0*a_id;
    v_cellPos = a_cellPos.xyz;
    v_fractPos = vec3(a_fractPos.xyz);
    v_normal = a_normal;
}
