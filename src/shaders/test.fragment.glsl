#version 330 core
precision highp float;

in vec3 v_color;
in vec3 v_position;
out vec4 FragColor;

void main() {
  FragColor = vec4(v_color, 1);
}
